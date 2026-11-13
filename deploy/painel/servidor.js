'use strict';
// ===========================================================================
// Painel de publicação — roda no seu Windows e abre no navegador.
// Faz o mesmo que o deploy/atualizar-servidor.ps1, mas com tela e senha:
//   build → pacote → envio por SFTP → deploy/atualizar.sh no servidor
//   (backup do banco, migrações pendentes, troca dos arquivos, reinício).
//
//   Dois cliques em deploy/painel/abrir-painel.cmd   (ou: node servidor.js)
//
// Só escuta em 127.0.0.1. As senhas ficam só na memória durante a publicação:
// não são gravadas em disco nem aparecem no registro.
// ===========================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, exec, execFile } = require('child_process');
const { Client } = require('ssh2');

const PORTA_INICIAL = Number(process.env.PORTA_PAINEL) || 4777;
const RAIZ_PADRAO = path.resolve(__dirname, '..', '..');
const TOKEN = crypto.randomBytes(24).toString('hex');
const PASTA_BACKUP_PADRAO = path.join(os.homedir(), 'Documents', 'GestaoMotel-backups');
const ARQ_HOSTS = path.join(__dirname, '.hosts-conhecidos.json');
const TAR = fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'))
  ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
  : 'tar';

let portaAtual = PORTA_INICIAL;
let emAndamento = false;
let historico = [];          // eventos da publicação atual (reenviados a quem reconectar)
const ouvintes = new Set();  // conexões SSE abertas
let etapaAtual = null;

// ---------------------------------------------------------------- eventos
function emitir(tipo, dados = {}) {
  const ev = { tipo, t: Date.now(), ...dados };
  historico.push(ev);
  const linha = `data: ${JSON.stringify(ev)}\n\n`;
  for (const r of ouvintes) r.write(linha);
}
const log = (texto, nivel = 'info') => emitir('log', { texto, nivel });
function etapa(id, estado, detalhe) {
  if (estado === 'andamento') etapaAtual = id;
  emitir('etapa', { id, estado, detalhe });
}

// ---------------------------------------------------------------- validação
const RE_HOST = /^[A-Za-z0-9.-]{1,253}$/;
const RE_USUARIO = /^[a-z_][a-z0-9_-]{0,31}$/;
const RE_PASTA_REMOTA = /^\/[A-Za-z0-9._\/-]{1,200}$/;

function validarServidor(c) {
  const host = String(c.host || '').trim();
  const usuario = String(c.usuario || '').trim();
  const pastaRemota = String(c.pastaRemota || '').trim().replace(/\/+$/, '');
  const porta = Number(c.porta);
  if (!RE_HOST.test(host)) throw new Error('Endereço do servidor inválido.');
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('Porta inválida.');
  if (!RE_USUARIO.test(usuario)) throw new Error('Usuário inválido.');
  if (!RE_PASTA_REMOTA.test(pastaRemota) || pastaRemota.includes('..')) throw new Error('Pasta do sistema no servidor inválida.');
  const senha = String(c.senha || '');
  const senhaSudo = String(c.senhaSudo || '') || senha;
  return { host, porta, usuario, pastaRemota, senha, senhaSudo };
}

function validarProjeto(pasta) {
  const p = path.resolve(String(pasta || '').trim() || RAIZ_PADRAO);
  if (!fs.existsSync(path.join(p, 'backend', 'package.json'))) {
    throw new Error(`"${p}" não parece a pasta do projeto (falta backend\\package.json).`);
  }
  if (!fs.existsSync(path.join(p, 'deploy', 'atualizar.sh'))) {
    throw new Error(`Falta deploy\\atualizar.sh em "${p}".`);
  }
  return p;
}

// ---------------------------------------------------------------- processos locais
function rodar(cmd, args, { cwd, shell = false, silencioso = false } = {}) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, args, { cwd, shell, windowsHide: true });
    let saida = '';
    const tratar = (d) => {
      const s = d.toString();
      saida += s;
      if (!silencioso) log(s, 'saida');
    };
    p.stdout.on('data', tratar);
    p.stderr.on('data', tratar);
    p.on('error', falha);
    p.on('close', (codigo) => {
      if (codigo === 0) ok(saida);
      else falha(new Error(`"${cmd} ${args.join(' ')}" terminou com código ${codigo}.`));
    });
  });
}
const git = (pasta, args) => rodar('git', ['-c', 'core.quotepath=off', ...args], { cwd: pasta, silencioso: true });

async function infoGit(pasta) {
  try {
    const branch = (await git(pasta, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
    const commit = (await git(pasta, ['rev-parse', '--short', 'HEAD'])).trim();
    const mensagem = (await git(pasta, ['log', '-1', '--format=%s'])).trim();
    const status = (await git(pasta, ['status', '--porcelain'])).split('\n').filter(Boolean);
    return { branch, commit, mensagem, alteracoes: status };
  } catch {
    return null;
  }
}

function infoDist(pasta) {
  const ver = (rel) => {
    const f = path.join(pasta, rel);
    return fs.existsSync(f) ? fs.statSync(f).mtime.toISOString() : null;
  };
  return {
    backend: ver(path.join('backend', 'dist', 'server.js')),
    frontend: ver(path.join('frontend', 'dist', 'index.html')),
  };
}

// confere se a pasta é mesmo um dist (backend: tem server.js; frontend: tem index.html)
const ARQUIVO_DIST = { backend: 'server.js', frontend: 'index.html' };
function validarDist(pasta, tipo) {
  const p = path.resolve(String(pasta || '').trim());
  const arquivo = ARQUIVO_DIST[tipo];
  if (!arquivo) throw new Error('Tipo de dist inválido.');
  if (!fs.existsSync(path.join(p, arquivo))) {
    throw new Error(`"${p}" não é o dist do ${tipo} (falta ${arquivo}). Escolha a pasta certa ou marque "Gerar o build agora".`);
  }
  return p;
}

function migracoesLocais(pasta) {
  const dir = path.join(pasta, 'database', 'migracoes');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

// lista os arquivos que vão no pacote (pelo git; sem git, percorre as pastas)
async function arquivosDoPacote(pasta) {
  const pastas = ['backend', 'frontend', 'database', 'deploy'];
  let lista;
  try {
    const saida = await git(pasta, ['ls-files', '-z', '-co', '--exclude-standard', '--', ...pastas]);
    lista = saida.split('\0').filter(Boolean);
  } catch {
    lista = [];
    const ignorar = /(^|\/)(node_modules|dist|uploads|backups|versoes-anteriores|\.git)(\/|$)|(^|\/)\.env$/;
    const andar = (rel) => {
      for (const nome of fs.readdirSync(path.join(pasta, rel))) {
        const r = `${rel}/${nome}`;
        if (ignorar.test(r)) continue;
        const st = fs.statSync(path.join(pasta, r));
        if (st.isDirectory()) andar(r); else lista.push(r);
      }
    };
    for (const p of pastas) if (fs.existsSync(path.join(pasta, p))) andar(p);
  }
  return lista.filter((a) =>
    !/^deploy\/(backups|versoes-anteriores|painel)\//.test(a) &&
    !/\.senha-postgres-gerada$/.test(a) &&
    !/(^|\/)\.env$/.test(a) &&
    fs.existsSync(path.join(pasta, a)) && fs.statSync(path.join(pasta, a)).isFile());
}

// ---------------------------------------------------------------- SSH
function carregarHosts() {
  try { return JSON.parse(fs.readFileSync(ARQ_HOSTS, 'utf8')); } catch { return {}; }
}

function conectar(cfg) {
  return new Promise((ok, falha) => {
    const conn = new Client();
    const chave = `${cfg.host}:${cfg.porta}`;
    let motivoRecusa = null;
    const opcoes = {
      host: cfg.host,
      port: cfg.porta,
      username: cfg.usuario,
      readyTimeout: 20000,
      keepaliveInterval: 15000,
      tryKeyboard: true,
      hostHash: 'sha256',
      hostVerifier: (impressao) => {
        const hosts = carregarHosts();
        if (!hosts[chave]) {
          hosts[chave] = impressao;
          fs.writeFileSync(ARQ_HOSTS, JSON.stringify(hosts, null, 2));
          log(`Primeira conexão com ${chave}. Impressão digital do servidor guardada: SHA256 ${impressao}\n`, 'aviso');
          return true;
        }
        if (hosts[chave] !== impressao) {
          motivoRecusa = `A identidade do servidor ${chave} mudou (impressão digital diferente da guardada). ` +
            'Pode ser reinstalação do servidor ou alguém interceptando a conexão. Se tiver certeza de que é o ' +
            `servidor certo, apague a linha dele em ${ARQ_HOSTS} e tente de novo.`;
          return false;
        }
        return true;
      },
    };
    if (cfg.senha) {
      opcoes.password = cfg.senha;
    } else {
      const chavePrivada = ['id_ed25519', 'id_rsa', 'id_ecdsa']
        .map((n) => path.join(os.homedir(), '.ssh', n)).find((f) => fs.existsSync(f));
      if (!chavePrivada) return falha(new Error('Informe a senha do SSH.'));
      opcoes.privateKey = fs.readFileSync(chavePrivada);
    }
    conn.on('keyboard-interactive', (_n, _i, _l, prompts, terminar) => terminar(prompts.map(() => cfg.senha)));
    conn.on('ready', () => ok(conn));
    conn.on('error', (e) => {
      if (motivoRecusa) return falha(new Error(motivoRecusa));
      if (/authentication/i.test(e.message)) return falha(new Error('Usuário ou senha do SSH incorretos.'));
      if (e.code === 'ECONNREFUSED') return falha(new Error(`O servidor recusou a conexão na porta ${cfg.porta}.`));
      if (e.code === 'ETIMEDOUT' || /timed out/i.test(e.message)) return falha(new Error('O servidor não respondeu (tempo esgotado).'));
      if (e.code === 'ENOTFOUND') return falha(new Error(`Endereço "${cfg.host}" não encontrado.`));
      falha(e);
    });
    conn.connect(opcoes);
  });
}

function execRemoto(conn, comando, { entrada, aoLer } = {}) {
  return new Promise((ok, falha) => {
    conn.exec(comando, (erro, stream) => {
      if (erro) return falha(erro);
      let saida = '';
      let resto = '';
      const tratar = (d) => {
        const s = d.toString();
        saida += s;
        if (!aoLer) return;
        resto += s;
        const linhas = resto.split('\n');
        resto = linhas.pop();
        linhas.forEach((l) => aoLer(l.replace(/\r$/, '')));
      };
      stream.on('data', tratar);
      stream.stderr.on('data', tratar);
      stream.on('close', (codigo) => {
        if (aoLer && resto) aoLer(resto);
        ok({ codigo, saida });
      });
      if (entrada !== undefined) stream.write(entrada + '\n');
      stream.end();
    });
  });
}

function enviarArquivo(conn, local, remoto, aoProgredir) {
  return new Promise((ok, falha) => {
    conn.sftp((erro, sftp) => {
      if (erro) return falha(erro);
      sftp.fastPut(local, remoto, { step: (feito, _p, total) => aoProgredir && aoProgredir(feito, total) }, (e) => {
        sftp.end();
        if (e) falha(e); else ok();
      });
    });
  });
}

function baixarArquivo(conn, remoto, local, aoProgredir) {
  return new Promise((ok, falha) => {
    conn.sftp((erro, sftp) => {
      if (erro) return falha(erro);
      sftp.fastGet(remoto, local, { step: (feito, _p, total) => aoProgredir && aoProgredir(feito, total) }, (e) => {
        sftp.end();
        if (e) falha(e); else ok();
      });
    });
  });
}

// cria (se preciso) a pasta local dos backups e confere se dá para gravar nela
function prepararPastaBackup(pasta) {
  const bruto = String(pasta || '').trim();
  if (!bruto || !path.isAbsolute(bruto)) throw new Error('Informe a pasta completa para a cópia do backup (ex: D:\\Backups\\GestaoMotel).');
  const p = path.resolve(bruto);
  try {
    fs.mkdirSync(p, { recursive: true });
    fs.accessSync(p, fs.constants.W_OK);
  } catch {
    throw new Error(`Não consigo gravar na pasta de backup "${p}".`);
  }
  return p;
}

// baixa o backup feito no servidor para a pasta local; não derruba a publicação se falhar
async function copiarBackup(conn, cfg, backupRemoto, opcoes) {
  if (!opcoes.baixarBackup) {
    etapa('copia', 'pulada', 'não marcado');
    return null;
  }
  etapa('copia', 'andamento');
  const prefixo = `${cfg.pastaRemota}/deploy/backups/`;
  if (!backupRemoto || !backupRemoto.startsWith(prefixo) || !/^[A-Za-z0-9._\/-]+\.backup$/.test(backupRemoto)) {
    const erro = 'o backup não chegou a ser feito no servidor';
    etapa('copia', 'pulada', erro);
    return { ok: false, erro };
  }
  const nome = path.posix.basename(backupRemoto);
  const local = path.join(opcoes.pastaBackup, nome);
  const parcial = `${local}.baixando`;
  try {
    log(`Copiando o backup para ${local}...\n`);
    let ultimo = -10;
    await baixarArquivo(conn, backupRemoto, parcial, (feito, total) => {
      const pct = total ? Math.floor((feito / total) * 100) : 100;
      if (pct >= ultimo + 10 || feito === total) { ultimo = pct; emitir('progresso', { id: 'copia', pct, verbo: 'baixando' }); }
    });
    fs.renameSync(parcial, local);
    const mb = (fs.statSync(local).size / 1048576).toFixed(1);
    etapa('copia', 'ok', `${local} · ${mb} MB`);
    return { ok: true, local };
  } catch (e) {
    fs.rmSync(parcial, { force: true });
    log(`Não foi possível copiar o backup: ${e.message}\n`, 'aviso');
    etapa('copia', 'erro', e.message);
    return { ok: false, erro: e.message };
  }
}

const aspas = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// situação do sistema no servidor (versão, serviço, migrações já aplicadas)
async function situacaoServidor(cfg, pastaProjeto) {
  const conn = await conectar(cfg);
  try {
    const p = aspas(cfg.pastaRemota);
    const script = [
      `cd ${p} 2>/dev/null || { echo "@@SEM_PASTA"; exit 0; }`,
      'echo "@@VERSAO"; cat VERSAO 2>/dev/null',
      'echo "@@SERVICO"; systemctl is-active gestaomotel 2>/dev/null',
      'echo "@@MIGRACOES"',
      'U="$(grep -E \'^DATABASE_URL=\' backend/.env 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d \'\\r\\042\\047\')"',
      'if [ -z "$U" ]; then echo "@@SEM_ENV";',
      'elif ! psql "$U" -X -tAc "SELECT 1 FROM information_schema.tables WHERE table_name=\'migracoes_aplicadas\'" 2>/dev/null | grep -q 1; then echo "@@SEM_TABELA";',
      'else psql "$U" -X -tAc "SELECT arquivo FROM migracoes_aplicadas ORDER BY 1" 2>/dev/null; fi',
    ].join('\n');
    const { saida } = await execRemoto(conn, `bash -c ${aspas(script)}`);
    if (saida.includes('@@SEM_PASTA')) throw new Error(`A pasta ${cfg.pastaRemota} não existe no servidor.`);
    const trecho = (de, ate) => {
      const i = saida.indexOf(de);
      if (i < 0) return '';
      const j = ate ? saida.indexOf(ate, i) : saida.length;
      return saida.slice(i + de.length, j < 0 ? saida.length : j).trim();
    };
    const versao = trecho('@@VERSAO', '@@SERVICO');
    const servico = trecho('@@SERVICO', '@@MIGRACOES') || 'desconhecido';
    const mig = trecho('@@MIGRACOES');
    const locais = pastaProjeto ? migracoesLocais(pastaProjeto) : [];
    let aplicadas = null;
    let pendentes = locais;
    if (mig === '@@SEM_ENV') {
      pendentes = null;
    } else if (mig !== '@@SEM_TABELA') {
      aplicadas = mig.split('\n').map((s) => s.trim()).filter(Boolean);
      pendentes = locais.filter((m) => !aplicadas.includes(m));
    }
    return {
      versao: versao || null,
      servico,
      controleMigracoes: mig === '@@SEM_TABELA' ? 'ausente' : (mig === '@@SEM_ENV' ? 'sem-env' : 'ok'),
      pendentes,
    };
  } finally {
    conn.end();
  }
}

// ---------------------------------------------------------------- publicação
const TITULOS_REMOTOS = [
  [/^Conferindo/, 'envio'],
  [/^Backup do banco/, 'backup'],
  [/^Migrações do banco/, 'migracoes'],
  [/^Guardando a versão atual/, 'arquivos'],
  [/^Copiando os arquivos novos/, 'arquivos'],
  [/^Dependências/, 'arquivos'],
  [/^Reiniciando o serviço/, 'reinicio'],
];

async function publicar(cfg, opcoes) {
  const pasta = opcoes.pasta;
  const carimbo = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gestaomotel-painel-'));
  const staging = path.join(tmp, 'pacote');
  const pacoteNome = `gestaomotel-${carimbo}.tar.gz`;
  const scriptNome = `gestaomotel-atualizar-${carimbo}.sh`;
  const pacote = path.join(tmp, pacoteNome);
  let conn = null;

  try {
    // 1. Código
    etapa('codigo', 'andamento');
    const g = await infoGit(pasta);
    if (g) {
      log(`Branch ${g.branch}, commit ${g.commit} — ${g.mensagem}\n`);
      if (g.alteracoes.length && !opcoes.permitirAlteracoes) {
        throw new Error(`Há ${g.alteracoes.length} alteração(ões) sem commit. Faça o commit ou marque "Publicar mesmo com alterações sem commit".`);
      }
      etapa('codigo', 'ok', `${g.branch} · ${g.commit}${g.alteracoes.length ? ' · com alterações sem commit' : ''}`);
    } else {
      log('A pasta não é um repositório git: o pacote será montado pelos arquivos da pasta.\n', 'aviso');
      etapa('codigo', 'ok', 'sem git');
    }

    const backend = path.join(pasta, 'backend');
    const precisaNpm = opcoes.rodarTestes || opcoes.gerarBuild;
    if (precisaNpm && !fs.existsSync(path.join(backend, 'node_modules'))) {
      log('Instalando as dependências do backend (npm install)...\n');
      await rodar('npm', ['install', '--no-fund', '--no-audit'], { cwd: backend, shell: true });
    }

    // 2. Testes
    if (opcoes.rodarTestes) {
      etapa('testes', 'andamento');
      await rodar('npm', ['test'], { cwd: backend, shell: true });
      etapa('testes', 'ok');
    } else {
      etapa('testes', 'pulada', 'não marcado');
    }

    // 3. Build
    let distBackend = path.join(pasta, 'backend', 'dist');
    let distFrontend = path.join(pasta, 'frontend', 'dist');
    if (opcoes.gerarBuild) {
      etapa('build', 'andamento');
      await rodar('npm', ['run', 'build'], { cwd: backend, shell: true });
      etapa('build', 'ok');
    } else {
      distBackend = validarDist(opcoes.distBackend || distBackend, 'backend');
      distFrontend = validarDist(opcoes.distFrontend || distFrontend, 'frontend');
      log(`Usando o dist do backend:  ${distBackend}\nUsando o dist do frontend: ${distFrontend}\n`);
      const data = fs.statSync(path.join(distBackend, 'server.js')).mtime;
      etapa('build', 'pulada', `dist existente de ${data.toLocaleString('pt-BR')}`);
    }

    // 4. Pacote
    etapa('pacote', 'andamento');
    const arquivos = await arquivosDoPacote(pasta);
    for (const a of arquivos) {
      const destino = path.join(staging, a);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(path.join(pasta, a), destino);
    }
    fs.cpSync(distBackend, path.join(staging, 'backend', 'dist'), { recursive: true });
    fs.cpSync(distFrontend, path.join(staging, 'frontend', 'dist'), { recursive: true });
    const agora = new Date().toLocaleString('sv-SE');
    let versao = g ? `commit ${g.commit} (${g.branch})\ngerado em ${agora}` : `gerado em ${agora}`;
    if (g && g.alteracoes.length) versao += '\ncom alterações sem commit';
    fs.writeFileSync(path.join(staging, 'VERSAO'), versao + '\n');
    await rodar(TAR, ['-czf', pacote, '-C', staging, '.'], { silencioso: true });
    const tamanho = fs.statSync(pacote).size;
    etapa('pacote', 'ok', `${arquivos.length} arquivos + dist · ${(tamanho / 1048576).toFixed(1)} MB`);

    // 5. Envio
    etapa('envio', 'andamento');
    log(`Conectando em ${cfg.usuario}@${cfg.host}:${cfg.porta}...\n`);
    conn = await conectar(cfg);
    log('Conectado. Enviando o pacote...\n');
    let ultimo = 0;
    await enviarArquivo(conn, pacote, `/tmp/${pacoteNome}`, (feito, total) => {
      const pct = Math.floor((feito / total) * 100);
      if (pct >= ultimo + 10 || feito === total) { ultimo = pct; emitir('progresso', { id: 'envio', pct }); }
    });
    await enviarArquivo(conn, path.join(staging, 'deploy', 'atualizar.sh'), `/tmp/${scriptNome}`);
    log('Pacote enviado. Rodando a atualização no servidor...\n');

    // 6. Atualização no servidor (deploy/atualizar.sh)
    let falhouNoServidor = false;
    let backupRemoto = null;
    const comando =
      `sed -i 's/\\r$//' /tmp/${scriptNome} && bash /tmp/${scriptNome} /tmp/${pacoteNome} ${aspas(cfg.pastaRemota)}; ` +
      `s=$?; rm -f /tmp/${scriptNome} /tmp/${pacoteNome}; exit $s`;
    const { codigo } = await execRemoto(conn, comando, {
      entrada: cfg.senhaSudo,
      aoLer: (linha) => {
        const limpa = linha.replace(/\x1b\[[0-9;]*m/g, '').trim();
        const titulo = limpa.match(/^=== (.+) ===$/);
        if (titulo) {
          if (/^Voltando para a versão anterior/.test(titulo[1])) {
            falhouNoServidor = true;
            etapa('reinicio', 'erro', 'não subiu — voltando a versão anterior');
          } else {
            const achou = TITULOS_REMOTOS.find(([re]) => re.test(titulo[1]));
            if (achou && achou[1] !== etapaAtual) {
              if (etapaAtual) etapa(etapaAtual, 'ok');
              etapa(achou[1], 'andamento');
            }
          }
        }
        if (/^Nenhuma migração pendente/.test(limpa)) emitir('detalhe', { id: 'migracoes', detalhe: 'nenhuma pendente' });
        const aplicada = limpa.match(/^(\S+\.sql) aplicada\.$/);
        if (aplicada) emitir('detalhe', { id: 'migracoes', detalhe: `aplicada ${aplicada[1]}`, acumular: true });
        if (/^Backup salvo em /.test(limpa)) {
          backupRemoto = limpa.slice(16).trim();
          emitir('detalhe', { id: 'backup', detalhe: path.posix.basename(backupRemoto) });
        }
        emitir('log', { texto: linha + '\n', nivel: 'remoto' });
      },
    });
    if (codigo !== 0) {
      // marca a etapa que falhou e, mesmo assim, tenta trazer o backup (se ele chegou a ser feito)
      if (etapaAtual) etapa(etapaAtual, 'erro');
      etapaAtual = null;
      await copiarBackup(conn, cfg, backupRemoto, opcoes);
      etapaAtual = null;
      throw new Error(falhouNoServidor
        ? 'O sistema não subiu com a versão nova e voltou para a anterior. Veja o registro.'
        : `A atualização no servidor parou (código ${codigo}). Veja o registro.`);
    }
    etapa('reinicio', 'ok', 'sistema respondendo');

    // 7. Cópia do backup para este computador
    const copia = await copiarBackup(conn, cfg, backupRemoto, opcoes);
    let mensagem = g ? `Versão ${g.commit} publicada.` : 'Versão publicada.';
    if (copia && copia.ok) mensagem += ` Backup copiado para ${copia.local}.`;
    if (copia && !copia.ok) mensagem += ` Atenção: o backup ficou só no servidor (${copia.erro}).`;
    emitir('fim', { ok: true, mensagem });
  } catch (e) {
    if (etapaAtual) etapa(etapaAtual, 'erro');
    log(`\n${e.message}\n`, 'erro');
    emitir('fim', { ok: false, mensagem: e.message });
  } finally {
    if (conn) conn.end();
    fs.rmSync(tmp, { recursive: true, force: true });
    etapaAtual = null;
    emAndamento = false;
  }
}

// ---------------------------------------------------------------- seletor de pasta (Windows)
function escolherPasta(inicial, descricao, novaPasta = false) {
  return new Promise((ok) => {
    const ps = [
      '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      '$d.Description = $env:DESCRICAO',
      '$d.ShowNewFolderButton = ($env:NOVA_PASTA -eq "1")',
      'if ($env:PASTA_INICIAL -and (Test-Path $env:PASTA_INICIAL)) { $d.SelectedPath = $env:PASTA_INICIAL }',
      'if ($d.ShowDialog($f) -eq "OK") { $d.SelectedPath }',
    ].join('; ');
    const codificado = Buffer.from(ps, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-STA', '-EncodedCommand', codificado],
      {
        env: { ...process.env, PASTA_INICIAL: inicial || '', DESCRICAO: descricao || 'Escolha a pasta', NOVA_PASTA: novaPasta ? '1' : '0' },
        windowsHide: true, encoding: 'utf8',
      },
      (_e, stdout) => ok((stdout || '').trim() || null));
  });
}

// ---------------------------------------------------------------- HTTP
function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let corpo = '';
    req.on('data', (d) => { corpo += d; if (corpo.length > 1e5) req.destroy(); });
    req.on('end', () => { try { ok(corpo ? JSON.parse(corpo) : {}); } catch (e) { falha(e); } });
  });
}
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const servidor = http.createServer(async (req, res) => {
  // só aceita o próprio painel (evita que outro site aberto no navegador use a API)
  const hostOk = [`127.0.0.1:${portaAtual}`, `localhost:${portaAtual}`].includes(req.headers.host);
  if (!hostOk) { res.writeHead(403); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace('__TOKEN__', TOKEN);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  if (req.method === 'GET' && /^\/logo(-dark)?\.png$/.test(url.pathname)) {
    const f = path.join(RAIZ_PADRAO, 'frontend', url.pathname === '/logo.png' ? 'logo-a2.png' : 'logo-a2-dark.png');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    return fs.createReadStream(f).pipe(res);
  }

  const tokenOk = req.headers['x-token'] === TOKEN || url.searchParams.get('token') === TOKEN;
  if (!tokenOk) return json(res, 403, { erro: 'Acesso negado.' });

  try {
    if (req.method === 'GET' && url.pathname === '/api/eventos') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ tipo: 'estado', emAndamento })}\n\n`);
      for (const ev of historico) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      ouvintes.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); ouvintes.delete(res); });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/projeto') {
      const pasta = validarProjeto(url.searchParams.get('pasta'));
      return json(res, 200, {
        pasta,
        git: await infoGit(pasta),
        dist: infoDist(pasta),
        migracoes: migracoesLocais(pasta),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/padrao') {
      return json(res, 200, { pasta: RAIZ_PADRAO, pastaBackup: PASTA_BACKUP_PADRAO, emAndamento });
    }

    if (req.method === 'POST' && url.pathname === '/api/escolher-pasta') {
      const corpo = await lerCorpo(req);
      const descricoes = {
        projeto: 'Escolha a pasta do projeto (a que tem backend e frontend)',
        distBackend: 'Escolha o dist do backend (a pasta que tem o server.js)',
        distFrontend: 'Escolha o dist do frontend (a pasta que tem o index.html)',
        backup: 'Escolha a pasta onde guardar a cópia dos backups do banco',
      };
      return json(res, 200, { pasta: await escolherPasta(corpo.inicial, descricoes[corpo.tipo], corpo.tipo === 'backup') });
    }

    if (req.method === 'GET' && url.pathname === '/api/dist') {
      const tipo = url.searchParams.get('tipo');
      const p = validarDist(url.searchParams.get('pasta'), tipo);
      return json(res, 200, { pasta: p, data: fs.statSync(path.join(p, ARQUIVO_DIST[tipo])).mtime.toISOString() });
    }

    if (req.method === 'POST' && url.pathname === '/api/testar') {
      const corpo = await lerCorpo(req);
      const cfg = validarServidor(corpo);
      let pasta = null;
      try { pasta = validarProjeto(corpo.pasta); } catch { /* sem projeto: só não calcula pendentes */ }
      return json(res, 200, await situacaoServidor(cfg, pasta));
    }

    if (req.method === 'POST' && url.pathname === '/api/publicar') {
      if (emAndamento) return json(res, 409, { erro: 'Já há uma publicação em andamento.' });
      const corpo = await lerCorpo(req);
      const cfg = validarServidor(corpo);
      const opcoes = {
        pasta: validarProjeto(corpo.pasta),
        gerarBuild: corpo.gerarBuild !== false,
        rodarTestes: corpo.rodarTestes !== false,
        permitirAlteracoes: corpo.permitirAlteracoes === true,
        distBackend: corpo.distBackend ? String(corpo.distBackend) : null,
        distFrontend: corpo.distFrontend ? String(corpo.distFrontend) : null,
        baixarBackup: corpo.baixarBackup !== false,
        pastaBackup: null,
      };
      if (opcoes.baixarBackup) opcoes.pastaBackup = prepararPastaBackup(corpo.pastaBackup);
      if (!opcoes.gerarBuild) {
        // confere antes de começar, para o erro aparecer na hora
        validarDist(opcoes.distBackend || path.join(opcoes.pasta, 'backend', 'dist'), 'backend');
        validarDist(opcoes.distFrontend || path.join(opcoes.pasta, 'frontend', 'dist'), 'frontend');
      }
      emAndamento = true;
      historico = [];
      emitir('inicio', { opcoes: { ...opcoes }, destino: `${cfg.usuario}@${cfg.host}:${cfg.pastaRemota}` });
      publicar(cfg, opcoes);
      return json(res, 202, { ok: true });
    }

    json(res, 404, { erro: 'Não encontrado.' });
  } catch (e) {
    json(res, 400, { erro: e.message });
  }
});

function iniciar(porta, tentativas = 10) {
  portaAtual = porta;
  servidor.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tentativas > 0) return iniciar(porta + 1, tentativas - 1);
    console.error(e.message);
    process.exit(1);
  });
  servidor.listen(porta, '127.0.0.1', () => {
    const endereco = `http://127.0.0.1:${porta}`;
    console.log(`\nPainel de publicação aberto em ${endereco}`);
    console.log('Deixe esta janela aberta enquanto usa o painel. Para fechar: Ctrl+C.\n');
    if (!process.env.SEM_NAVEGADOR) exec(`start "" "${endereco}"`);
  });
}
iniciar(PORTA_INICIAL);
