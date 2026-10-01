// Roda uma vez, depois de aplicar o schema.sql.
// Cria só o login do diretor (igual ao front-end, sem contas fictícias) e a configuração
// real de suítes por categoria de estrela em cada unidade.
// Uso: node seed.js
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./db');

const ABAS_ADMIN = [
  'painel', 'lancar', 'consumo-plantao', 'vistoria', 'extrato', 'comprovantes', 'boletos',
  'fechamento', 'impostos', 'funcionarios', 'vencidos', 'revpar', 'manutencao',
  'boletos-admin', 'notas-fiscais', 'relatorio', 'rede',
];
const SETORES_COMPROVANTES_ADMIN = ['lancamentos', 'boletos', 'boletos-admin', 'impostos'];
const PERMISSOES_FINANCEIRAS_TODAS = ['excluir_lancamentos', 'editar_valores', 'apagar_comprovantes', 'excluir_boletos'];

// configuração real de suítes, por unidade e categoria de estrela
const SUITES_CONFIG = [
  { unidade: 'jardim', categoria: '4 estrelas', quantidade: 1 },
  { unidade: 'jardim', categoria: '3 estrelas', quantidade: 2 },
  { unidade: 'jardim', categoria: '2 estrelas', quantidade: 7 },
  { unidade: 'jardim', categoria: '1 estrela', quantidade: 12 },
  { unidade: 'pacoval', categoria: '4 estrelas', quantidade: 1 },
  { unidade: 'pacoval', categoria: '3 estrelas', quantidade: 5 },
  { unidade: 'pacoval', categoria: '2 estrelas', quantidade: 8 },
  { unidade: 'pacoval', categoria: '1 estrela', quantidade: 15 },
  { unidade: 'nova', categoria: '3 estrelas', quantidade: 2 },
  { unidade: 'nova', categoria: '2 estrelas', quantidade: 8 },
  { unidade: 'nova', categoria: '1 estrela', quantidade: 16 },
  { unidade: 'santana', categoria: '4 estrelas', quantidade: 4 },
  { unidade: 'santana', categoria: '3 estrelas', quantidade: 4 },
  { unidade: 'santana', categoria: '2 estrelas', quantidade: 6 },
  { unidade: 'santana', categoria: '1 estrela', quantidade: 10 },
  { unidade: 'beirol1', categoria: '3 estrelas', quantidade: 1 },
  { unidade: 'beirol1', categoria: '2 estrelas', quantidade: 11 },
  { unidade: 'beirol1', categoria: '1 estrela', quantidade: 23 },
  { unidade: 'beirol2', categoria: '5 estrelas', quantidade: 1 },
  { unidade: 'beirol2', categoria: '4 estrelas', quantidade: 1 },
  { unidade: 'beirol2', categoria: '3 estrelas', quantidade: 5 },
  { unidade: 'beirol2', categoria: '2 estrelas', quantidade: 9 },
  { unidade: 'beirol2', categoria: '1 estrela', quantidade: 9 },
];

async function main() {
  // senha inicial: a do SEED_SENHA (se definida) ou uma aleatória, mostrada uma única vez no final
  const senhaInicial = process.env.SEED_SENHA || crypto.randomBytes(9).toString('base64url');
  const senhaHash = await bcrypt.hash(senhaInicial, 10);

  const { rows: jaExiste } = await db.query("SELECT 1 FROM usuarios WHERE login='diretor'");
  const { rows } = await db.query(
    `INSERT INTO usuarios (login, senha_hash, nome, papel, todas_unidades, pode_ver_dashboards, escopo_comprovantes)
     VALUES ('diretor', $1, 'Direção geral', 'admin', true, true, 'tudo')
     ON CONFLICT (login) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
    [senhaHash]
  );
  const diretorId = rows[0].id;

  for (const aba of ABAS_ADMIN) {
    await db.query('INSERT INTO usuario_abas (usuario_id, aba) VALUES ($1,$2) ON CONFLICT DO NOTHING', [diretorId, aba]);
  }
  for (const s of SETORES_COMPROVANTES_ADMIN) {
    await db.query('INSERT INTO usuario_setores_comprovantes (usuario_id, setor) VALUES ($1,$2) ON CONFLICT DO NOTHING', [diretorId, s]);
  }
  for (const p of PERMISSOES_FINANCEIRAS_TODAS) {
    await db.query('INSERT INTO usuario_permissoes_financeiras (usuario_id, permissao) VALUES ($1,$2) ON CONFLICT DO NOTHING', [diretorId, p]);
  }
  console.log('OK: diretor (admin — vê e pode tudo)');

  for (const s of SUITES_CONFIG) {
    await db.query(
      'INSERT INTO suites_config (unidade_id, categoria, quantidade) VALUES ($1,$2,$3)',
      [s.unidade, s.categoria, s.quantidade]
    );
  }
  console.log(`OK: configuração de suítes cadastrada (${SUITES_CONFIG.length} categorias no total)`);

  if (jaExiste.length) {
    console.log('\nPronto! O usuário "diretor" já existia — a senha dele NÃO foi alterada.');
  } else {
    console.log(`\nPronto! Login: diretor / senha: ${senhaInicial}\nAnote agora — ela não será mostrada de novo. Troque-a assim que entrar.`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
