// Datas no fuso de Belém (UTC-3). Usar toISOString() devolve a data em UTC, que a partir das
// 21h já é o dia seguinte — isso bloqueava lançamentos do turno da noite e gravava data errada.
const FUSO = process.env.FUSO_HORARIO || 'America/Belem';
const formatador = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO }); // sv-SE => YYYY-MM-DD

function hoje() {
  return formatador.format(new Date());
}

module.exports = { hoje };
