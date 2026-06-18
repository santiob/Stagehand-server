/**
 * Test Tombola Salteña — Estrategia híbrida Stagehand v3 + Playwright
 *
 * Criterio de uso:
 *  - Playwright puro  → login, navegación, selectores estables, screenshots
 *  - Stagehand (IA)   → cerrar tooltips/modales complejos en iframe,
 *                       extracción de datos del cupón generado
 */

import { test, expect }           from '@playwright/test';
import { Stagehand }               from '@browserbasehq/stagehand';
import { z }                       from 'zod';
import type { Page, FrameLocator } from '@playwright/test';

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

// ─── Helpers Playwright puro ──────────────────────────────────────────────────

async function cerrarModalTutorial(page: Page): Promise<boolean> {
  console.log('🔍 [PW] Cerrando modal tutorial...');
  await page.waitForTimeout(1500);

  const iframe: FrameLocator = page.frameLocator('iframe[title="juego"]');
  const modal   = iframe.locator('[class*="ModalTour_modal"]').first();
  const visible = await modal.isVisible().catch(() => false);

  if (!visible) {
    console.log('  ✅ No hay modal de tutorial');
    return true;
  }

  console.log('  ⚠️ Modal detectado, cerrando...');
  const btnClose = iframe.locator('[class*="ModalTour_closeBtn"]').first();

  if (await btnClose.isVisible().catch(() => false)) {
    await btnClose.click();
    console.log('  ✓ Click en X');
    await page.waitForTimeout(1000);
    if (!(await modal.isVisible().catch(() => false))) {
      console.log('  ✅ Modal cerrado');
      return true;
    }
  }

  await page.keyboard.press('Escape');
  console.log('  ✓ Escape presionado');
  await page.waitForTimeout(500);
  return true;
}

async function cerrarTooltipFallback(page: Page, maxPasos = 10): Promise<boolean> {
  console.log('  🔄 [PW] Fallback: cerrando tooltip...');
  const iframe: FrameLocator = page.frameLocator('iframe[title="juego"]');
  await page.waitForTimeout(1500);

  for (let i = 0; i < maxPasos; i++) {
    const floater = iframe.locator('div.__floater.__floater__open');
    if (!(await floater.isVisible().catch(() => false))) {
      console.log(`  ✅ Tooltip cerrado en ${i} pasos`);
      return true;
    }

    const botonX = iframe.locator('button.step_closeStep__fJaF_');
    if (await botonX.isVisible().catch(() => false)) {
      await botonX.click();
      await page.waitForTimeout(1500);
      continue;
    }

    const siguiente = iframe.locator('button:has-text("Siguiente")');
    if (await siguiente.isVisible().catch(() => false)) {
      await siguiente.click();
      await page.waitForTimeout(1500);
      continue;
    }

    const cerrar = iframe.locator('button:has-text("Cerrar")');
    if (await cerrar.isVisible().catch(() => false)) {
      await cerrar.click();
      await page.waitForTimeout(1500);
      continue;
    }

    break;
  }

  // Último recurso: eliminar del DOM
  const contentFrame = await page.locator('iframe[title="juego"]').contentFrame();
  if (contentFrame) {
    await contentFrame.evaluate(() => {
      document.querySelectorAll('.__floater').forEach((el) => el.remove());
    });
    await page.waitForTimeout(500);
    console.log('  ✓ Tooltip eliminado del DOM');
  }

  return true;
}

// ─── Helpers Stagehand IA ─────────────────────────────────────────────────────

async function cerrarTooltipIframeIA(stagehand: Stagehand, page: Page): Promise<boolean> {
  console.log('🤖 [SH] Cerrando tooltip con IA...');
  try {
    await stagehand.act(
      `Si hay un tooltip, guía o tutorial flotante visible dentro del iframe del juego,
      cerralo completamente. Puede tener un botón X, "Cerrar" o "Siguiente".
      Si tiene varios pasos, avanzá hasta el final o cerralo con X.
      Si no hay ningún tooltip visible, no hagas nada.`
    );
    console.log('  ✅ Tooltip cerrado via IA');
    return true;
  } catch (err) {
    console.warn('  ⚠️ IA no pudo cerrar tooltip, usando fallback Playwright...');
    return cerrarTooltipFallback(page);
  }
}

async function cerrarDialogoJconfirmIA(stagehand: Stagehand, page: Page): Promise<boolean> {
  console.log('🤖 [SH] Verificando diálogo jconfirm...');
  await page.waitForTimeout(1000);

  const iframe  = page.frameLocator('iframe[title="juego"]');
  const dialogo = iframe.locator('.jconfirm.jconfirm-open').first();
  const visible = await dialogo.isVisible().catch(() => false);

  if (!visible) {
    console.log('  ✅ No hay diálogo jconfirm');
    return true;
  }

  console.log('  ⚠️ Diálogo detectado, cerrando con IA...');
  try {
    await stagehand.act(
      `Hay un diálogo de confirmación visible dentro del iframe del juego.
      Hacé click en el botón de aceptar, confirmar u OK para cerrarlo.
      Si no encontrás ese botón, usá el botón X o presioná Escape.`
    );
    console.log('  ✅ Diálogo cerrado via IA');
    return true;
  } catch (err) {
    console.warn('  ⚠️ IA falló, usando fallback Playwright...');
    const btnAceptar = iframe
      .locator('.jconfirm button:has-text("Aceptar"), .jconfirm button:has-text("OK"), .jconfirm button.btn-primary')
      .first();
    if (await btnAceptar.isVisible().catch(() => false)) {
      await btnAceptar.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(500);
    return true;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Test Tombola Salteña — Híbrido Stagehand', () => {

  let stagehand: Stagehand;

  test.beforeEach(async () => {
  // Limpiar instancia anterior si existe
  if (stagehand) {
    await stagehand.close().catch(() => {});
  }

  const username = process.env.TEST_USERNAME_SALTENA;
  const password = process.env.TEST_PASSWORD_SALTENA;

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
  await navegarConRetry(page, `${process.env.TEST_URL_SALTENA}/plataforma/home`);

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

  test('Tombo Express', async () => {
    const page = getPage(stagehand);

    // ── 1. Cerrar modal tutorial inicial ── Playwright puro ───────────────────
    await cerrarModalTutorial(page);

    // ── 2. Navegar al juego ── Stagehand IA ───────────────────────────────────
    await stagehand.act('hacer click en el link o botón de Tombo Express');
    console.log('✅ Click en Tombo Express ejecutado');

    await page.waitForTimeout(2000);
    await page.waitForSelector('iframe[title="juego"]', { timeout: 10000 });
    console.log('✅ iframe del juego detectado');

    await page.waitForTimeout(2000);
    await page.locator('iframe[title="juego"]').click({ position: { x: 640, y: 360 } });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'test-results/tomboexpress-01-pantalla.png', fullPage: true });

    // ── 3. Cerrar modal tutorial del juego ── Playwright puro ─────────────────
    await cerrarModalTutorial(page);

    // ── 4. Cerrar tooltip ── Stagehand IA ─────────────────────────────────────
   // await cerrarTooltipIframeIA(stagehand, page);

    // ── 5. Cerrar jconfirm si existe ── Stagehand IA ──────────────────────────
    //await cerrarDialogoJconfirmIA(stagehand, page);

    await page.screenshot({ path: 'test-results/tomboexpress-02-juego-limpio.png', fullPage: true });

    // ── 6. Cargar apuestas ────────────────────────────────────────────────────
    // Cambiá USE_IA_FOR_APUESTAS a true si los selectores del formulario
    // se vuelven inestables entre versiones del juego.
    const USE_IA_FOR_APUESTAS = true;

    for (let i = 1; i <= 2; i++) {
      console.log(`\n--- Apuesta ${i} ---`);
      const numeroDosCifras = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      console.log('🎲 Número sorteado:', numeroDosCifras);

      if (USE_IA_FOR_APUESTAS) {
        // ── Opción B: Stagehand IA ─────────────────────────────────────────
        // En lugar de un solo act para todo, hacerlo campo por campo
await stagehand.act(`Inside the game iframe, find the input field labeled "Numero" and type "${numeroDosCifras}" in it`);
await page.waitForTimeout(500);

await stagehand.act(`Inside the game iframe, find the input field labeled "Alcance" and type "10" in it`);
await page.waitForTimeout(500);

await stagehand.act(`Inside the game iframe, find the input field labeled "Importe" and type "150" in it`);
await page.waitForTimeout(500);

await stagehand.act(`Inside the game iframe, click the button to add the bet (the + button or "Agregar jugada")`);
console.log(`  ✅ Apuesta ${i} completada via IA`)

      } else {
        // ── Opción A: Playwright puro via frameLocator ─────────────────────
        const iframe: FrameLocator = page.frameLocator('iframe[title="juego"]');
        await page.waitForTimeout(1000);

        await iframe.locator('input').nth(0).fill(numeroDosCifras);
        await iframe.locator('input').nth(1).fill('10');
        await iframe.locator('input').nth(2).fill('150');

        await page.screenshot({ path: `test-results/tomboexpress-03-apuesta-${i}.png`, fullPage: true });

        await iframe.locator('#btn-addJugada').click();
        console.log(`  ✅ Jugada ${i} agregada`);
        await page.waitForTimeout(1000);
      }
    }

    // ── 7. Confirmar juego ── Stagehand IA ───────────────────────────────────
   await stagehand.act('hacer click en el botón JUGAR! dentro del iframe del juego');
   console.log('✅ Click en JUGAR! ejecutado');

   await page.waitForTimeout(5000); // ← esperar respuesta del servidor

    // ── 8. Verificar cupón ── Stagehand IA ────────────────────────────────────
  //  console.log('🤖 [SH] Verificando cupón generado...');

  //  const schema = z.object({
  //    cuponNumero:  z.string().describe('Número o código del cupón generado, o vacío si no hay'),
  //    mensajeExito: z.string().describe('Mensaje de confirmación visible, o vacío si no hay'),
  //  });

  //  const resultado = await stagehand.extract(
  //    `Dentro del iframe del juego, buscá si hay un número de cupón, código de confirmación
  //    o mensaje de éxito que indique que la apuesta fue procesada correctamente.
  //    Si no hay ninguno, retorná un string vacío en cuponNumero.`,
  //    schema,
  //  ) as { cuponNumero: string; mensajeExito: string };

  //  console.log('🎟️ Cupón:', resultado.cuponNumero || '(no detectado)');
  //  console.log('💬 Mensaje:', resultado.mensajeExito || '(no detectado)');

    await page.screenshot({ path: 'test-results/tomboexpress-04-cupon-generado.png', fullPage: true });
    console.log('🎉 ¡Test de Tombo Express completado exitosamente!');
  });

});
