// Conexão única (pool) com o Postgres, reaproveitada por toda a API.
require('dotenv').config();
const { Pool, types } = require('pg');

// colunas DATE vêm como texto puro (YYYY-MM-DD), sem isso o driver converte pra
// Date no fuso do servidor e pode virar o dia errado ao serializar como JSON
types.setTypeParser(1082, valor => valor);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // O Postgres está em GMT; sem isso, CURRENT_DATE e os DEFAULT das colunas viram o dia seguinte
  // a partir das 21h (horário de Belém). Vale só pra conexões desta aplicação.
  options: `-c TimeZone=${process.env.FUSO_HORARIO || 'America/Belem'}`,
  // Supabase/Neon exigem SSL em produção — descomente a linha abaixo se necessário:
  // ssl: { rejectUnauthorized: false },
});

module.exports = {
  // Uso: const { rows } = await query('SELECT * FROM unidades');
  query: (texto, parametros) => pool.query(texto, parametros),
  pool,
};
