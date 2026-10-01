# Como colocar o sistema no computador do cliente (Linux/Ubuntu, via SSH)

## Antes de ir

- [ ] Ubuntu ou Debian no computador escolhido (o "servidor" da unidade —
      fica ligado o dia todo)
- [ ] Acesso SSH com um usuário que tenha `sudo`
- [ ] Internet no computador durante a instalação (só nessa hora — depois o
      sistema roda sem internet, é tudo local)

## Passo a passo

1. Copie o projeto pro computador do cliente. Do seu computador, com o zip
   já em mãos (`GestaoMotel.zip` na raiz do projeto):
   ```bash
   scp GestaoMotel.zip usuario@IP-DO-CLIENTE:~/
   ssh usuario@IP-DO-CLIENTE
   ```
   Já dentro do SSH:
   ```bash
   sudo apt-get update && sudo apt-get install -y unzip   # se ainda não tiver
   unzip GestaoMotel.zip -d GestaoMotel
   cd GestaoMotel
   ```

2. Rode o instalador:
   ```bash
   sudo bash deploy/instalar.sh
   ```
   Isso vai (sozinho, sem precisar responder nada):
   - Instalar Node.js e PostgreSQL, se ainda não tiverem
   - Criar o banco de dados e as tabelas
   - Gerar as senhas de segurança (arquivo `.env`)
   - Instalar as dependências do sistema
   - Registrar o sistema como serviço do **systemd** (liga sozinho com a
     máquina e reinicia sozinho se travar)
   - Liberar a porta 3001 no firewall (`ufw`), se estiver ativo

   Leva uns 5-10 minutos, a maior parte é o download do Node/Postgres.

3. No final, o script mostra dois endereços:
   - `http://localhost:3001` — funciona só nesse computador
   - `http://<IP-da-máquina>:3001` — é esse que os outros
     computadores/tablets da rede vão usar

4. No navegador desse computador (ou pelo próprio terminal com `curl
   http://localhost:3001/api/saude`), confirme que responde. Se tiver um
   navegador disponível ali, abra `http://localhost:3001` e entre com
   `diretor` / `123`.

5. **Troque a senha do diretor imediatamente** (aba Usuários > editar o
   próprio usuário).

6. Em outro computador/tablet **da mesma rede** (Wi-Fi ou cabo), abra o
   navegador em `http://<IP-da-máquina>:3001` e confirme que também funciona.

## Depois de instalado

- **Deixe o IP fixo no roteador** (reserva de DHCP) — senão esse IP pode
  mudar depois de uma queda de energia ou reinício do roteador, e os
  atalhos salvos nos outros dispositivos param de funcionar.

- **Configure o backup diário** — sem isso, um problema no disco derruba
  todo o histórico financeiro:
  ```bash
  crontab -e
  ```
  Adicione a linha (ajustando o caminho pra onde você extraiu o projeto):
  ```
  0 3 * * * /usr/bin/bash /home/usuario/GestaoMotel/deploy/backup.sh
  ```
  Teste rodando `bash deploy/backup.sh` manualmente uma vez, pra confirmar
  que gera o arquivo em `deploy/backups/`.

- **Guarde a senha do banco em local seguro** — está em
  `deploy/.senha-postgres-gerada`. Não precisa decorar, só não apagar o
  arquivo nem deixar ele acessível pra qualquer um (já fica só com
  permissão de leitura do dono, `chmod 600`).

## Se algo der errado

- **Serviço não sobe**: `sudo systemctl status gestaomotel` — se tiver
  parado, veja o motivo com `journalctl -u gestaomotel -n 50`.
- **Não acessa de outro dispositivo**: confirme que os dois estão na mesma
  rede (mesmo Wi-Fi/roteador) e que a porta 3001 está liberada
  (`sudo ufw status`).
- **Esqueceu a senha do diretor**: rode de novo
  `cd backend && node seed.js` — ele recria o login `diretor` com senha
  `123` sem apagar mais nada (usuário atualiza, não duplica).
- **Precisa reiniciar o sistema manualmente**:
  ```bash
  sudo systemctl restart gestaomotel
  ```

## Atualizando o sistema depois (nova versão do código)

1. Pare o serviço: `sudo systemctl stop gestaomotel`
2. Substitua os arquivos do projeto (menos `backend/.env`,
   `backend/node_modules`, `backend/uploads` e `deploy/.senha-postgres-gerada`
   — esses são específicos dessa instalação, não mexa)
3. Se mudou alguma dependência: `cd backend && npm install`
4. Reinicie: `sudo systemctl start gestaomotel`

## Se um dia precisar instalar num Windows em vez de Linux
Veja `windows-instalar.ps1`, `windows-backup.ps1` e `windows-DEPLOY.md` —
fazem a mesma coisa, mas com PowerShell, Serviço do Windows e Firewall do
Windows.
