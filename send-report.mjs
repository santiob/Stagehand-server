import { execSync } from 'child_process';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const resend = new Resend(process.env.RESEND_API_KEY);

const reportPath = path.resolve('./playwright-report/index.html');
const xmlPath    = path.resolve('./test-results/results.xml');
const reportDir  = path.resolve('./playwright-report');

// Leer el reporte HTML
const htmlReport = fs.existsSync(reportPath)
  ? fs.readFileSync(reportPath, 'utf-8')
  : '<p>No se generó reporte HTML.</p>';

// Parsear resultados básicos del XML
let summary      = 'Sin datos';
let failedTests  = '';
let passedSuites = '';

if (fs.existsSync(xmlPath)) {
  const xml      = fs.readFileSync(xmlPath, 'utf-8');
  const tests    = (xml.match(/tests="(\d+)"/)   || [])[1] || '?';
  const failures = (xml.match(/failures="(\d+)"/) || [])[1] || '?';
  const errors   = (xml.match(/errors="(\d+)"/)   || [])[1] || '0';
  const skipped  = (xml.match(/skipped="(\d+)"/)  || [])[1] || '?';
  const totalFailed = parseInt(failures) + parseInt(errors);
  const passed   = parseInt(tests) - totalFailed - parseInt(skipped);
  summary = `Total: ${tests} | ✅ Pasaron: ${passed} | ❌ Fallaron: ${totalFailed} | ⏭️ Saltados: ${skipped}`;

  // --- Detectar suites y sus fallos (failures + errors) ---
  const suiteRegex   = /<testsuite[^>]+name="([^"]+)"[^>]*failures="(\d+)"[^>]*errors="(\d+)"[^>]*>/g;
  const suiteFailMap = {};
  let suiteMatch;

  while ((suiteMatch = suiteRegex.exec(xml)) !== null) {
    const suiteName     = suiteMatch[1];
    const suiteFailures = parseInt(suiteMatch[2]) || 0;
    const suiteErrors   = parseInt(suiteMatch[3]) || 0;
    suiteFailMap[suiteName] = suiteFailures + suiteErrors;
  }

  // Suites sin fallos → leyenda OK
  const okSuites = Object.entries(suiteFailMap)
    .filter(([, fails]) => fails === 0)
    .map(([name]) => name);

  if (okSuites.length > 0) {
    const okRows = okSuites.map(name => `
      <tr>
        <td style="padding: 10px 14px; border: 1px solid #c3e6cb; color: #155724; font-size: 14px;">
          ✅ Test Quini Express de <strong>${name}</strong> OK
        </td>
      </tr>
    `).join('');

    passedSuites = `
      <h3 style="color: #155724;">✅ Suites sin fallos</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tbody style="background: #d4edda;">
          ${okRows}
        </tbody>
      </table>
    `;
  }

  // --- Informe de tests fallidos (failure + error) ---
  if (totalFailed > 0) {
    // Captura tanto <failure> como <error> dentro de cada <testcase>
    // El mensaje puede estar en el atributo message="" o como primera línea del contenido del tag
    const testCaseRegex = /<testcase[^>]+name="([^"]+)"[^>]*classname="([^"]+)"[^>]*>[\s\S]*?<(?:failure|error)([^>]*)>([\s\S]*?)<\/(?:failure|error)>/g;
    let match;
    const failedList = [];

    while ((match = testCaseRegex.exec(xml)) !== null) {
      const classname  = match[2]; // nombre del archivo spec
      const attributes = match[3]; // atributos del tag failure/error
      const content    = match[4]; // contenido interno del tag

      // Intentar extraer message del atributo primero, luego de la primera línea del contenido
      const attrMessage = (attributes.match(/message="([^"]*)"/) || [])[1];
      let message = attrMessage
        ? attrMessage
        : content.replace(/<!\[CDATA\[/, '').trim().split('\n')[0].trim();

      message = message
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

      // Extraer contexto archivo:línea:col del CDATA (ej: quinielainsta.stagehand.spec.ts:146:8)
      const cdataText = content.replace(/<!\[CDATA\[/, '').replace(/\]\]>/, '').trim();
      const contextMatch = cdataText.match(/[\w.\-]+\.(?:spec\.ts|spec\.js|test\.ts|test\.js):\d+:\d+/);
      const fileContext = contextMatch ? contextMatch[0] : classname;

      failedList.push(`
        <tr>
          <td style="padding: 8px; border: 1px solid #f5c6cb; color: #721c24; font-size: 12px;">
            <span style="display:block; font-weight: bold; margin-bottom: 4px;">${message}</span>
            <span style="display:block; font-family: monospace; font-size: 11px; opacity: 0.85;">📄 ${fileContext}</span>
          </td>
        </tr>
      `);
    }

    if (failedList.length > 0) {
      failedTests = `
        <h3 style="color: #721c24;">❌ Tests Fallidos</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #f8d7da;">
              <th style="padding: 8px; border: 1px solid #f5c6cb; text-align: left;">Error</th>
            </tr>
          </thead>
          <tbody>
            ${failedList.join('')}
          </tbody>
        </table>
      `;
    }
  }
}

const fecha = new Date().toLocaleDateString('es-AR', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
});

// Comprimir playwright-report (sin videos ni screenshots)
const zipPath = path.resolve('./playwright-report.zip');
if (fs.existsSync(reportDir)) {
  execSync(`zip -r ${zipPath} ./playwright-report -x "*.webm" -x "*.mp4" -x "*.png"`);
}

const attachments = [];
if (fs.existsSync(zipPath)) {
  const zipSize = fs.statSync(zipPath).size;
  console.log(`📦 Tamaño del zip: ${(zipSize / 1024 / 1024).toFixed(2)} MB`);

  if (zipSize < 35 * 1024 * 1024) {
    attachments.push({
      filename: 'stagehand-report.zip',
      content:  fs.readFileSync(zipPath).toString('base64'),
      encoding: 'base64',
    });
  } else {
    console.log('⚠️ Zip demasiado grande, se enviará sin adjunto');
  }
}

const response = await resend.emails.send({
  from: 'Stagehand <ci@tecnoaccion.com.ar>',
  to: ['sobregon@tecnoaccion.com.ar', 'gmilich@tecnoaccion.com.ar', 'cocampos@tecnoaccion.com.ar', 'fernando.perez@tecnoaccion.com.ar', 'ffigueroa@tecnoaccion.com.ar', 'hbraun@tecnoaccion.com.ar', 'csaissac@tecnoaccion.com.ar', 'hamartinez@tecnoaccion.com.ar'],
  subject: `🤖 Stagehand Report — ${fecha}`,
  html: `
    <h2>Reporte de Tests Stagehand (IA)</h2>
    <p><strong>Fecha:</strong> ${fecha}</p>
    <p><strong>Resumen:</strong> ${summary}</p>
    ${passedSuites}
    ${failedTests}
    <hr/>
    <p>📎 El reporte completo se encuentra adjunto en <strong>stagehand-report.zip</strong></p>
  `,
  attachments,
});

console.log('📧 Respuesta de Resend:', JSON.stringify(response, null, 2));

if (response.error) {
  console.error('❌ Error al enviar:', response.error);
} else {
  console.log('✅ Reporte enviado por email. ID:', response.data?.id);
}
