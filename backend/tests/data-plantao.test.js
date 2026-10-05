const test = require('node:test');
const assert = require('node:assert/strict');

const { hoje, dataDoPlantao, turnoAtual } = require('../utils/data');

// horários em UTC; Belém é UTC-3
test('depois das 21h de Belém hoje() continua no mesmo dia (antes virava o dia seguinte em UTC)', () => {
  assert.equal(hoje(new Date('2026-10-03T00:30:00Z')), '2026-10-02'); // 21:30 em Belém
});

test('de madrugada o plantão em andamento é o da noite que começou no dia anterior', () => {
  const madrugada = new Date('2026-10-03T05:00:00Z'); // 02:00 em Belém
  assert.equal(hoje(madrugada), '2026-10-03');
  assert.equal(dataDoPlantao(madrugada), '2026-10-02');
  assert.equal(turnoAtual(madrugada), 'noite');
});

test('a virada de plantão acontece às 08h e às 20h', () => {
  assert.equal(dataDoPlantao(new Date('2026-10-03T10:59:00Z')), '2026-10-02'); // 07:59
  assert.equal(turnoAtual(new Date('2026-10-03T10:59:00Z')), 'noite');
  assert.equal(dataDoPlantao(new Date('2026-10-03T11:00:00Z')), '2026-10-03'); // 08:00
  assert.equal(turnoAtual(new Date('2026-10-03T11:00:00Z')), 'dia');
  assert.equal(turnoAtual(new Date('2026-10-02T22:59:00Z')), 'dia');           // 19:59
  assert.equal(turnoAtual(new Date('2026-10-02T23:00:00Z')), 'noite');         // 20:00
});
