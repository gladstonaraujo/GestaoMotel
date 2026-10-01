# Módulo Caixa

Responsável por:

- lançamentos de entrada e saída;
- despesas normais, parceladas e rateadas;
- extrato diário;
- comprovantes financeiros;
- fechamento e acompanhamento de compras parceladas.

As funções públicas continuam disponíveis globalmente porque os formulários
existentes ainda usam alguns manipuladores inline. A inicialização ocorre
somente depois que o núcleo e todos os módulos estão carregados.

`caixa.css` contém os componentes visuais exclusivos de comprovantes e compras
parceladas. Formulários, anexos e lightbox permanecem no CSS compartilhado.
