// Datas no fuso de Belém (UTC-3). Usar toISOString() devolve a data em UTC, que a partir das
// 21h já é o dia seguinte — isso bloqueava lançamentos do turno da noite e gravava data errada.
const FUSO = process.env.FUSO_HORARIO || 'America/Belem';
const formatador = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO }); // sv-SE => YYYY-MM-DD
const formatadorHora = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', hourCycle: 'h23' });

// Turno do dia: 08:00 às 20:00; turno da noite: 20:00 às 08:00 do dia seguinte
const INICIO_TURNO_DIA = 8;
const INICIO_TURNO_NOITE = 20;

function hoje(agora = new Date()) {
  return formatador.format(agora);
}

function horaAtual(agora = new Date()) {
  return parseInt(formatadorHora.format(agora), 10);
}

// Data do plantão em andamento: de madrugada (antes das 8h) ainda é o plantão da noite que
// começou ontem, então os lançamentos dele entram no dia anterior — assim o plantão inteiro
// fica no mesmo dia do extrato, em vez de ser partido em dois à meia-noite.
function dataDoPlantao(agora = new Date()) {
  if (horaAtual(agora) >= INICIO_TURNO_DIA) return hoje(agora);
  return hoje(new Date(agora.getTime() - 24 * 60 * 60 * 1000)); // Belém não tem horário de verão
}

function turnoAtual(agora = new Date()) {
  const hora = horaAtual(agora);
  return hora >= INICIO_TURNO_DIA && hora < INICIO_TURNO_NOITE ? 'dia' : 'noite';
}

module.exports = { hoje, dataDoPlantao, turnoAtual };
