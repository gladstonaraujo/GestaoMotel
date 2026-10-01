# Relatório de Revisão do Sistema de Gestão Financeira A2

Rede de Motéis — Beirol 1, Beirol 2, Jardim, Pacoval, Nova Esperança e Santana

Data: 01/10/2026

---

## Resumo

Fizemos uma revisão geral do sistema. Ele funciona e cobre bem o dia a dia: caixa, boletos, vistorias das suítes, funcionários, produtos vencidos e relatórios da diretoria. Também tem pontos fortes, como o registro de tudo que é excluído e a exigência de foto da nota nas saídas de caixa.

A revisão encontrou **14 pontos que precisam de atenção**. Nenhum deles impede o uso hoje, mas alguns deixam o sistema mais exposto a erros e a acessos indevidos do que deveria. A maioria é de correção simples.

Nem todo o sistema foi revisado. Ficaram de fora a conferência detalhada de cada tela, os scripts de instalação e algumas áreas menores. Se a revisão for ampliada, podem surgir outros pontos parecidos com os abaixo.

**Como ler este relatório:** os pontos estão divididos por urgência.
- **Alta:** corrigir primeiro.
- **Média:** corrigir em seguida.
- **Baixa:** organização e melhoria, sem risco imediato.

---

## Urgência alta

### 1. Um gerente consegue mexer em registros de outra unidade
**O que acontece:** o sistema confere a unidade do usuário ao listar ou criar registros, mas não confere ao editar, excluir ou marcar como pago um lançamento ou boleto já existente. Quem tem essa permissão consegue agir sobre registros de qualquer unidade, desde que conheça o número do registro.
**Exemplo:** um gerente do Jardim poderia marcar como pago um boleto de Santana, e isso geraria uma saída no caixa de Santana.
**Risco:** alteração ou exclusão indevida de valores entre unidades.
**Solução:** o sistema passa a verificar se o usuário pertence à unidade do registro antes de permitir a ação.

### 2. As fotos de notas e comprovantes podem ser abertas sem senha
**O que acontece:** quem receber o link de uma foto (nota fiscal, comprovante, vistoria) consegue abri-la sem fazer login. Os links são difíceis de adivinhar, mas podem ser repassados ou ficar salvos em conversas e no histórico do navegador.
**Risco:** vazamento de documentos da empresa.
**Solução:** as fotos só serão exibidas para quem estiver logado e tiver acesso àquela unidade.

### 3. Senhas e chaves de segurança ainda são as de teste
**O que acontece:** o sistema é instalado com o usuário "diretor" e a senha "123", e a chave interna de segurança usada nos logins é uma de testes.
**Risco:** quem souber disso consegue entrar como diretor, com acesso a tudo.
**Solução:** trocar a senha do diretor e a chave de segurança por valores fortes, e fazer a instalação já pedir uma senha própria. **Se isso ainda não foi feito, é o ponto mais rápido e mais importante de resolver.**

### 4. Não há limite de tentativas de login
**O que acontece:** alguém pode tentar milhares de senhas seguidas sem ser bloqueado. Como o sistema pode ser acessado por qualquer aparelho da rede do motel, isso pesa mais.
**Risco:** descoberta de senhas por tentativa e erro.
**Solução:** bloquear temporariamente o login depois de várias tentativas erradas.

---

## Urgência média

### 5. Mudanças de permissão demoram a valer
**O que acontece:** quando o login é feito, o sistema guarda as permissões da pessoa por 12 horas. Se o diretor retirar uma permissão ou desativar um funcionário, a pessoa pode continuar com o acesso antigo até o login expirar.
**Solução:** o sistema passa a conferir as permissões atuais a cada uso, ou o tempo de validade do login é reduzido.

### 6. Os campos dos formulários são pouco conferidos
**O que acontece:** quando alguém preenche um campo (valor, data, turno, perfil de usuário etc.), o sistema confere pouca coisa antes de salvar. Hoje a conferência é feita em poucos lugares, de forma espalhada, e não é a mesma na tela e no servidor. Alguém com conhecimento técnico consegue contornar a conferência da tela e enviar dados direto ao servidor, que aceita.
**Exemplos reais:**
- um lançamento pode ser criado com valor negativo ou zerado em algumas situações;
- datas e turnos digitados fora do padrão podem ser aceitos;
- é possível cadastrar um usuário com um perfil que não existe;
- o diretor consegue, sem querer, tirar o próprio acesso de administrador ou desativar o último administrador;
- campos de texto (descrição, observação) não têm limite de tamanho.
**Risco:** dados errados no caixa e nos relatórios, e situações difíceis de desfazer.
**Solução:** criar regras claras para cada campo (tipo, valor mínimo e máximo, formato de data, tamanho do texto, opções permitidas), aplicadas **sempre no servidor** e repetidas na tela, para o usuário ver o aviso na hora e a regra não poder ser contornada.

### 7. Cadastros podem ficar pela metade
**O que acontece:** algumas ações têm várias etapas (por exemplo, cadastrar um usuário com unidades e permissões, ou registrar uma vistoria com itens e fotos). Se algo falhar no meio, o que já foi salvo fica no sistema sem o restante.
**Exemplo:** um usuário criado sem nenhuma unidade, ou um boleto marcado como pago sem a saída correspondente no caixa.
**Solução:** fazer cada ação ser salva por completo ou não ser salva.

### 8. O sistema vai ficar mais lento com o tempo
**O que acontece:** algumas telas, como a lista de vistorias e a de usuários, carregam todo o histórico de uma vez. Como as vistorias são registradas todos os dias nas seis unidades, a lentidão tende a crescer.
**Solução:** carregar por período e em partes menores.

### 9. Faltam proteções gerais de segurança
**O que acontece:** o acesso é feito sem criptografia (sem o "cadeado" do navegador), então senhas e dados trafegam sem proteção dentro da rede. Também faltam algumas proteções padrão que sistemas desse tipo costumam ter.
**Solução:** ativar a criptografia no acesso e aplicar as proteções padrão. Também vale conferir a configuração do firewall do computador onde o sistema está instalado.

### 10. Envio de fotos pode travar o sistema por instantes e quebrar fotos antigas
**O que acontece:** durante o envio de uma foto grande, o sistema pode ficar lento para os demais usuários. Além disso, o endereço completo da foto fica gravado, incluindo o IP do computador. Se esse IP mudar, as fotos antigas deixam de aparecer.
**Solução:** gravar apenas o local da foto, sem o IP, e melhorar a forma de salvar os arquivos.

### 14. A data do sistema vira o dia seguinte às 21h
**O que acontece:** o sistema calcula "hoje" com um horário diferente do de Belém (3 horas à frente). A partir das 21h, ele já considera que é o dia seguinte.
**Exemplo:** um funcionário do turno da noite pode ser impedido de lançar, porque o sistema acha que a data está "diferente de hoje", ou o lançamento pode ser salvo com a data errada.
**Solução:** fazer o sistema usar o horário de Belém em todas as datas.

---

## Urgência baixa

### 11. O manual de instalação está desatualizado
**O que acontece:** o manual cita arquivos de instalação com nomes que mudaram.
**Solução:** atualizar o manual.

### 12. Todo o sistema está em uma única página
**O que acontece:** toda a parte que o usuário vê (telas de login, painel, lançamentos, boletos, vistorias, funcionários, relatórios e as demais) está dentro de **uma só página**, controlada por um único arquivo de programação com mais de 5 mil linhas. As "abas" não são telas separadas: são partes da mesma página que aparecem e somem.
**Por que isso importa:**
- qualquer alteração, mesmo pequena, mexe no mesmo arquivo grande e pode causar efeito em outra aba sem querer;
- fica mais difícil achar a causa quando algo dá errado;
- a página carrega tudo de uma vez, mesmo para quem usa só uma ou duas abas, e isso pesa em aparelhos mais simples, como celulares e tablets;
- como as abas não têm endereço próprio, não dá para guardar nos favoritos ou enviar o link de uma tela específica, e o botão "voltar" do navegador não funciona como a pessoa espera;
- é mais difícil dividir o trabalho entre mais de uma pessoa.
**Solução:** organizar aos poucos, separando o código por área (caixa, boletos, vistorias etc.), sem refazer o sistema do zero e sem mudar o que o usuário já conhece. Pode ser feito uma aba por vez, junto com as outras correções.

### 13. Não há histórico de versões nem testes automáticos
**O que acontece:**
- O código do sistema não tem controle de versões, ou seja, não dá para voltar atrás se uma alteração der problema.
- Não existem testes automáticos que confirmem que as regras de caixa e de permissão continuam funcionando depois de cada mudança.
**Solução:** criar o controle de versões **antes** de fazer as correções acima e adicionar testes para as regras mais importantes.

---

## Ordem de correção que recomendamos

1. **Trocar a senha do diretor e a chave de segurança** (ponto 3) e **limitar as tentativas de login** (ponto 4).
2. **Impedir o acesso entre unidades** (ponto 1) e **corrigir o horário do sistema** (ponto 14), que podem causar erros reais no caixa.
3. **Proteger as fotos de notas e comprovantes** (ponto 2).
4. **Criar o controle de versões** (ponto 13) antes de seguir com as demais mudanças.
5. **Pontos 5 a 10**: conferências de dados, cadastros completos, desempenho e proteções gerais.
6. **Pontos 11 e 12**: atualizar o manual e organizar o código da página aos poucos.

Nos pontos 3 e 4, o trabalho é pequeno e o ganho de segurança é grande. Podem ser feitos primeiro e rapidamente.

---

## Próximos passos

Se estiver de acordo, começamos pela primeira etapa da lista e avisamos a cada etapa concluída. Também podemos ampliar a revisão para as partes que ainda não foram analisadas.
