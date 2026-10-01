# Gestão Financeira A2 — Rede de Motéis

Sistema de controle de caixa, boletos, vistoria de suítes, funcionários e
relatórios pra rede de 6 unidades (Beirol 1, Beirol 2, Jardim, Pacoval,
Nova Esperança, Santana).

## Estrutura do projeto

```
projeto/
  database/
    schema.sql        -> todas as tabelas, prontas pra rodar no Postgres
  backend/
    server.js          -> API em Node.js + Express, e também serve o front-end
    routes/             -> uma rota por área (caixa, boletos, vistorias...)
    seed.js             -> cria o usuário inicial (diretor)
    README.md            -> como instalar e rodar em modo desenvolvimento
  frontend/
    index.html + styles.css + script.js -> a interface (chama a API do back-end)
  deploy/
    instalar.ps1         -> instala tudo num computador Windows novo (produção)
    backup.ps1            -> backup diário do banco de dados
    DEPLOY.md             -> passo a passo de implantação no cliente
```

## Como as partes se conectam

1. **database** — o Postgres guarda tudo: unidades, usuários, lançamentos,
   boletos, vistorias, funcionários, faltas, trocas de plantão, produtos
   vencidos, fotos (como link de arquivo, não mais em base64).

2. **backend** — a API lê e grava nesse banco (login com senha criptografada,
   permissões por papel/unidade) e também **serve o front-end** — é um único
   processo, uma porta só (3001 por padrão).

3. **frontend** — chama a API pra tudo. Não guarda mais nada só em memória.

O sistema está com a integração completa entre as três partes.

## Rodando em desenvolvimento

Veja `backend/README.md`.

## Colocando no computador do cliente (produção)

Veja `deploy/DEPLOY.md` — script de instalação automatizado pra Windows,
que já deixa o sistema rodando como Serviço do Windows (liga sozinho,
reinicia sozinho) e acessível por outros dispositivos da rede local.
