# Build e publicação

O projeto tem uma etapa de build opcional que **minifica** o front-end e **empacota** o
back-end em um arquivo só. Isso reduz o tamanho e dificulta a leitura do código, mas
**não o protege**: quem tiver acesso ao servidor ainda consegue copiá-lo e, no front-end,
qualquer usuário consegue ver o JS pelo navegador.

## O que o build gera

Comando (dentro de `backend/`):

```
npm install
npm run build
```

| Saída                      | Conteúdo                                                                  |
|----------------------------|---------------------------------------------------------------------------|
| `frontend/dist/`           | `index.html` (copiado como está), `script.js` e `styles.css` minificados  |
| `backend/dist/server.js`   | Back-end + bibliotecas em um arquivo só, minificado (~1 MB)               |

O script que faz isso é o `backend/build.js` (usa o esbuild, instalado como dependência
de desenvolvimento). As duas pastas `dist/` estão no `.gitignore`: são geradas, não versionadas.

Ficam de fora do pacote o `bcrypt` (módulo nativo) e o `pg-native` (opcional); o `bcrypt`
continua vindo do `node_modules`.

## Como rodar

| Modo                  | Comando                  | O que executa                                              |
|-----------------------|--------------------------|------------------------------------------------------------|
| Desenvolvimento       | `npm run dev`            | `server.js` (código-fonte), recarrega ao salvar            |
| Código-fonte          | `npm start`              | `server.js`                                                |
| Produção (empacotado) | `npm run start:prod`     | `dist/server.js`                                           |

O front-end é servido pelo próprio Express: se existir `frontend/dist`, serve essa pasta;
se não existir, serve o código-fonte de `frontend/`. Por isso o `dist` precisa ficar ao lado
de `backend/` (em `frontend/dist`). O `dist` sozinho **não** sobe o back-end: a API roda em
um processo Node separado, com o Postgres, e o front-end chama `/api` na mesma origem.

## Instaladores

`deploy/instalar.sh` (systemd) e `deploy/windows-instalar.ps1` (nssm) rodam
`npm install` e `npm run build`, e registram o serviço para iniciar `dist/server.js`.
Esses instaladores assumem o **projeto completo** no servidor.

## Atualizar um servidor que já está rodando

```
cd backend
npm install
npm run build
```

Depois, reinicie o serviço. Se o serviço foi instalado antes desta mudança, ele ainda
aponta para `server.js`; para usar o empacotado, altere o comando do serviço
(`ExecStart` no systemd, ou `nssm set <servico> AppParameters dist\server.js` no Windows).
Sem isso ele continua funcionando, só que rodando o código-fonte.

## Publicar sem o código-fonte legível

Se o objetivo é que o servidor do cliente não tenha o código-fonte, o build deve ser feito
na sua máquina e só o resultado enviado. Arquivos necessários no servidor:

- `backend/dist/` (o `server.js` empacotado)
- `backend/package.json` e `backend/package-lock.json`
- `backend/.env`
- `backend/uploads/`
- `frontend/dist/`
- `database/schema.sql` (para criar o banco na primeira instalação)

No servidor, instalar só as dependências de produção (`npm install --omit=dev`) e iniciar com
`node dist/server.js`.

Atenção: os instaladores atuais **não** cobrem este modo (eles esperam `build.js` e o código
completo). Há também o `seed.js`, que cria o usuário inicial e não é empacotado; ele só existe
no projeto completo, então esse passo precisa ser feito antes de publicar ou de outra forma.
Este fluxo ainda não foi automatizado nem testado.

## Pontos de atenção

- O empacotamento usa `RAIZ` no `server.js` para localizar `uploads/` e `frontend/` tanto
  rodando de `backend/` quanto de `backend/dist/`. Se criar novos caminhos baseados em
  `__dirname`, considere isso.
- O `.env` fica em texto no servidor (senha do banco, `JWT_SECRET`). Restrinja a leitura
  da pasta ao usuário que roda o serviço.
- A segurança do sistema vem das regras no back-end (login, permissões, validação), não de
  esconder o código. Para proteger a propriedade do sistema, use contrato/licença ou hospede
  você mesmo.
