# Como colocar o sistema no computador do cliente

Esse guia parte do princípio que você vai ter acesso remoto (TeamViewer/AnyDesk)
ao computador que vai ficar ligado o dia todo rodando o sistema — o "servidor"
da unidade. Os outros computadores/tablets da rede só precisam de um navegador.

## Antes de ir

- [ ] Windows 10 ou 11 no computador escolhido
- [ ] Internet no computador durante a instalação (só nessa hora — depois o
      sistema roda sem internet, é tudo local)
- [ ] Acesso de Administrador no Windows
- [ ] Copie a pasta inteira do projeto (`Motel/`) pro computador — **menos**
      `backend/node_modules` e `backend/.env`, se já existirem (o script cria
      esses de novo). Um jeito fácil: zipe a pasta, mande por pendrive ou
      transferência de arquivo do próprio TeamViewer/AnyDesk, e extraia em
      `C:\GestaoMotel` (ou onde preferir).

## Passo a passo

1. Abra o PowerShell **como Administrador** (botão direito no ícone > Executar
   como administrador).

2. Vá até a pasta `deploy` dentro do projeto:
   ```powershell
   cd C:\GestaoMotel\deploy
   ```

3. Rode o instalador:
   ```powershell
   .\instalar.ps1
   ```
   Isso vai (sozinho, sem precisar responder nada):
   - Instalar Node.js e PostgreSQL, se ainda não tiverem
   - Criar o banco de dados e as tabelas
   - Gerar as senhas de segurança (arquivo `.env`)
   - Instalar as dependências do sistema
   - Registrar o sistema como Serviço do Windows (liga sozinho com o PC e
     reinicia sozinho se travar)
   - Liberar a porta 3001 no Firewall do Windows

   Leva uns 5-10 minutos, a maior parte é o download do Node/Postgres.

4. No final, o script mostra dois endereços:
   - `http://localhost:3001` — funciona só nesse computador
   - `http://<IP-da-máquina>:3001` — é esse que os outros
     computadores/tablets da rede vão usar

5. Abra o navegador nesse computador em `http://localhost:3001` e confirme
   que a tela de login aparece. Entre com `diretor` / `123`.

6. **Troque a senha do diretor imediatamente** (aba Usuários > editar o
   próprio usuário).

7. Em outro computador/tablet **da mesma rede** (Wi-Fi ou cabo), abra o
   navegador em `http://<IP-da-máquina>:3001` e confirme que também funciona.

## Depois de instalado

- **Deixe o IP fixo no roteador** (reserva de DHCP, configurada no roteador
  da unidade) — senão esse IP pode mudar depois de um tempo ou de uma queda
  de energia, e os atalhos salvos nos outros dispositivos param de funcionar.
  Se não souber fazer isso, qualquer técnico de rede local resolve rápido.

- **Configure o backup diário** — sem isso, um problema no disco derruba
  todo o histórico financeiro:
  1. Abra o "Agendador de Tarefas" do Windows (Task Scheduler)
  2. Criar Tarefa Básica → repetir Diariamente, de madrugada (ex: 3h)
  3. Ação: Iniciar um programa
     - Programa: `powershell.exe`
     - Argumentos: `-ExecutionPolicy Bypass -File "C:\GestaoMotel\deploy\backup.ps1"`
  4. Teste rodando `deploy\backup.ps1` manualmente uma vez, pra confirmar que
     gera o arquivo em `deploy\backups\`

- **Guarde a senha do banco em local seguro** — está em
  `deploy\.senha-postgres-gerada`. Não é preciso decorar, só não apagar o
  arquivo nem deixar ele acessível pra qualquer um.

## Se algo der errado

- **Serviço não sobe**: `Get-Service GestaoMotel` no PowerShell. Se aparecer
  parado, veja o motivo em `backend\servico-erro.log`.
- **Não acessa de outro dispositivo**: confirme que os dois estão na mesma
  rede (mesmo Wi-Fi/roteador) e que o Firewall do Windows não foi resetado.
- **Esqueceu a senha do diretor**: peça pra rodar de novo
  `node seed.js` dentro de `backend\` — ele recria o login `diretor` com
  senha `123` sem apagar mais nada (usuário atualiza, não duplica).
- **Precisa reiniciar o sistema manualmente**:
  ```powershell
  Restart-Service GestaoMotel
  ```

## Atualizando o sistema depois (nova versão do código)

1. Pare o serviço: `Stop-Service GestaoMotel`
2. Substitua os arquivos do projeto (menos `backend\.env`,
   `backend\node_modules`, `backend\uploads` e `deploy\.senha-postgres-gerada`
   — esses são específicos dessa instalação, não mexa)
3. Se mudou alguma dependência: `cd backend; npm install`
4. Reinicie: `Start-Service GestaoMotel`
