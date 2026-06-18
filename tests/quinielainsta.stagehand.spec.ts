 /**
 *  Criterio de uso:
 *  - Playwright puro  → login, navegación, selectores estables, screenshots
 *  - Stagehand (IA)   → cerrar tooltips/modales complejos en iframe,
 *                       extracción de datos del cupón generado
 */

import { test, expect }           from '@playwright/test';
import { Stagehand }               from '@browserbasehq/stagehand';
import { z }                       from 'zod';
import type { Page, FrameLocator } from '@playwright/test';
import * as path                   from 'path';
import * as fs                     from 'fs';
 
// ─── Configuración ────────────────────────────────────────────────────────────
 
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR
  ? path.join(process.env.SCREENSHOTS_DIR, 'neuquina')
  : 'test-results/neuquina';
 
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
 
function screenshotPath(nombre: string): string {
  return path.join(SCREENSHOTS_DIR, nombre);
}

// ─── Helpers de navegación ────────────────────────────────────────────────────
 
async function navegarConRetry(page: Page, url: string, intentos = 3): Promise<void> {
  for (let i = 0; i < intentos; i++) {
    try {
      await page.goto(url, { timeout: 60000, waitUntil: 'commit' });
      await page.waitForTimeout(4000);
      return;
    } catch (err) {
      console.log(`  ⚠️ Intento ${i + 1}/${intentos} falló, reintentando...`);
      if (i === intentos - 1) throw err;
      await page.waitForTimeout(2000);
    }
  }
}
 
// ─── Helper para obtener el page desde el contexto de Stagehand v3 ───────────
 
function getPage(stagehand: Stagehand): Page {
  const ctx = stagehand.context;
  if (!ctx) throw new Error('Stagehand context no inicializado');
  const pages = ctx.pages();
  if (pages.length === 0) throw new Error('No hay páginas abiertas en el contexto');
  return pages[0] as unknown as Page;
}
// ─── Tests ────────────────────────────────────────────────────────────────────
 
test.describe('Test La Neuquina — Híbrido Stagehand', () => {
 
  let stagehand: Stagehand;
 
  test.beforeEach(async () => {
    // Limpiar instancia anterior si existe
    if (stagehand) {
      await stagehand.close().catch(() => {});
    }
  
    const username = process.env.TEST_USERNAME_NEUQUINA;
    const password = process.env.TEST_PASSWORD_NEUQUINA;
  
    if (!username || !password) {
      test.skip();
      console.log('⚠️ Test saltado: credenciales no configuradas');
      return;
    }
  
    stagehand = new Stagehand({
    env:       'LOCAL',
    apiKey:    process.env.OPENAI_API_KEY,
    modelName: 'gpt-4o',
    verbose:   0,
    headless:  true,
    localBrowserLaunchOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1920,1080',
      ],
    },
  })
  
      await stagehand.init();
  
      const page = getPage(stagehand);
  
      // ── LOGIN — Playwright puro ───────────────────────────────────────────────
    //  navegar sin esperar estado de carga
    await navegarConRetry(page, `${process.env.TEST_URL_NEUQUINA}/plataforma/home`);
  
      // Abrir modal de login
      const btnAcceso = page.locator('text=Acceso').first();
      await btnAcceso.click();
      await page.waitForSelector('#loginModal', { state: 'visible', timeout: 10000 });
      await page.waitForTimeout(2000);
      console.log('✅ Modal de login abierto');
  
      // Completar formulario directamente con page.locator()
      const inputUsuario = page.locator('#loginModal input[name="nroDocu"]:not(.nroDocuOlvide)');
      await page.waitForTimeout(1000);
      await inputUsuario.click();
      await page.waitForTimeout(300);
      await inputUsuario.fill(username);
      console.log('  ✓ Usuario ingresado');
  
      const inputPassword = page.locator('#loginModal input#clave:not(.nroDocuOlvide)').first();
      await page.waitForTimeout(500);
      await inputPassword.click();
      await page.waitForTimeout(300);
      await inputPassword.fill(password);
      console.log('  ✓ Contraseña ingresada');
  
      await page.locator('#botonLogin').click();
      console.log('🖱️ Click en Ingresar...');
  
      await page.waitForTimeout(3000);
  
      const loginExitoso = await page.locator('text=¡Hola').isVisible().catch(() => false);
  
      if (loginExitoso) {
        console.log('✅ LOGIN EXITOSO');
        expect(loginExitoso).toBeTruthy();
        await page.screenshot({ path: 'test-results/login-exitoso.png', fullPage: true });
      } else {
        throw new Error('❌ Login falló');
      }
    });

  test.afterEach(async () => {
    if (stagehand) {
      await stagehand.close();
      console.log('🔒 Stagehand cerrado');
    }
  });

   test('Quiniela Instantanea', async () => {
    const page = getPage(stagehand);
 
    await page.screenshot({ path: screenshotPath('home.png'), fullPage: true });
    console.log('✅ En pantalla de juegos');

     // CERRAR MODAL DE AVISOS GENERALES SI APARECE
  console.log('🔍 Verificando modal de Avisos generales...');
  
  // Esperar un momento para que aparezca el modal si va a aparecer
  await page.waitForTimeout(1500);
  
  const modalHeader = page.locator('#headerModal-12, .modalHeader-12');
  const isModalVisible = await modalHeader.isVisible().catch(() => false);
  
  if (isModalVisible) {
    console.log('⚠️ Modal de Avisos generales detectado, cerrándolo...');
    
    // Click en el botón de cerrar (X)
    const closeButton = page.locator('.modalHeader-12 button.close');
    await closeButton.click();
    
    console.log('✅ Modal cerrado exitosamente');
    
    // Esperar a que el modal desaparezca completamente
    await page.waitForTimeout(1000);
  } else {
    console.log('✅ No hay modal de avisos');
  }
 
    // ── Navegar al juego ── Stagehand IA ─────────────────────────────────────
    // TODO: reemplazar con el nombre del juego o acción correspondiente
    await stagehand.act('hacer click en el link o botón de Quiniela Instantanea');
    console.log('✅ Navegación al juego ejecutada');
 
    await page.waitForTimeout(3000);
    await page.screenshot({ path: screenshotPath('juego-01-pantalla.png'), fullPage: true });
 
   
    // ── Completar apuesta ── Stagehand IA ────────────────────────────────────
    // TODO: adaptar las instrucciones según el formulario real de Rionegrina
          
      const numeroDosCifras = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      console.log('🎲 Número sorteado:', numeroDosCifras);

      await stagehand.act(`Inside the game iframe, find the input field labeled "Numero" and type "${numeroDosCifras}" in it`);
      await page.waitForTimeout(500);
 
      await stagehand.act(`Inside the game iframe, find the input field labeled "Alcance" and type "10" in it`);
      await page.waitForTimeout(500);

      await stagehand.act(`Inside the game iframe, find the input field labeled "Importe" and type "200" in it`);
      await page.waitForTimeout(500);
 
      await stagehand.act(`Inside the game iframe, click the button to add the bet (the + button or "Agregar jugada")`);
      await page.waitForTimeout(1000);
 
      await page.screenshot({ path: screenshotPath(`juego-02-apuesta.png`), fullPage: true });
      console.log(`  ✅ Apuesta completada via IA`);
      
    // ── Confirmar juego ── Stagehand IA ──────────────────────────────────────
    await page.waitForTimeout(2000);
    await stagehand.act('hacer click en el botón JUGAR! dentro del iframe del juego');
    console.log('✅ Apuesta confirmada');
 
    await page.waitForTimeout(5000);
 
    // ── Verificar cupón ── Stagehand IA ──────────────────────────────────────
    //console.log('🤖 [SH] Verificando cupón generado...');
 
   // const schema = z.object({
   //   cuponNumero:  z.string().describe('Ticket number or confirmation code, empty if not found'),
   //   mensajeExito: z.string().describe('Success message visible on screen, empty if not found'),
   // });
 
   // const resultado = await stagehand.extract(
   //   `Look for a ticket number, confirmation code or success message
   //   indicating the bet was processed correctly. If none found, return empty strings.`,
   //   schema,
   // ) as { cuponNumero: string; mensajeExito: string };
 
   // console.log('🎟️ Cupón:', resultado.cuponNumero || '(no detectado)');
   // console.log('💬 Mensaje:', resultado.mensajeExito || '(no detectado)');
 
    await page.screenshot({ path: screenshotPath('juego-03-cupon.png'), fullPage: true });
    console.log('🎉 ¡Test de Quiniela Instantanea completado exitosamente!');
  });
});
