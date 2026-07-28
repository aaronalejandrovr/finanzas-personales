// ═══════════════════════════════════════════════════════════════
//  Finanzas Personales — Electron Main Process
// ═══════════════════════════════════════════════════════════════

const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow;
let serverInstance;

async function createWindow() {
    const { createApp } = require('./server');

    // ── Rutas seguras ──────────────────────────────────────────
    // appDir:  archivos de la app (public/, schema.sql) — dentro del paquete
    // dataDir: datos del usuario (DB, uploads) — persistente entre actualizaciones
    const userData = app.getPath('userData');

    const serverApp = createApp({
        appDir: __dirname,    // En app empaquetada, __dirname apunta al raíz del asar
        dataDir: userData     // Ej: C:\Users\aarxn\AppData\Roaming\finanzas-personales
    });

    // ── Iniciar backend ────────────────────────────────────────
    // Puerto 0 = dejar que el OS asigne un puerto libre
    const { port, server } = await serverApp.start(0);
    serverInstance = { server, cleanup: serverApp.cleanup };

    console.log(`[Electron] Servidor Express en puerto ${port}`);
    console.log(`[Electron] Datos persistentes en: ${userData}`);

    // ── Menú mínimo ────────────────────────────────────────────
    const menuTemplate = [
        {
            label: 'Archivo',
            submenu: [
                {
                    label: 'Abrir carpeta de datos',
                    click: () => shell.openPath(userData)
                },
                { type: 'separator' },
                {
                    label: 'Salir',
                    accelerator: 'Alt+F4',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Ver',
            submenu: [
                { label: 'Recargar', role: 'reload' },
                { label: 'Pantalla completa', role: 'togglefullscreen' },
                { type: 'separator' },
                { label: 'Acercar', role: 'zoomIn' },
                { label: 'Alejar', role: 'zoomOut' },
                { label: 'Tamaño original', role: 'resetZoom' },
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

    // ── Ventana principal ──────────────────────────────────────
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: 'Finanzas Personales',
        backgroundColor: '#0c0a18',
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.loadURL(`http://localhost:${port}`);

    // Mostrar cuando esté lista (evita flash blanco)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();

        // ── Auto-updater ───────────────────────────────────────
        // Configurar log para debugging
        autoUpdater.logger = require('electron').app;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        // Notificar cuando hay una actualización disponible
        autoUpdater.on('update-available', (info) => {
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Actualización disponible',
                message: `Nueva versión ${info.version} disponible. Descargando en segundo plano...`,
                buttons: ['OK']
            });
        });

        // Notificar cuando ya está lista para instalar
        autoUpdater.on('update-downloaded', () => {
            dialog.showMessageBox(mainWindow, {
                type: 'question',
                title: '¡Actualización lista!',
                message: 'Se descargó una nueva versión. ¿Deseas reiniciar e instalarla ahora?',
                buttons: ['Reiniciar ahora', 'Más tarde']
            }).then(result => {
                if (result.response === 0) {
                    autoUpdater.quitAndInstall();
                }
            });
        });

        // Comprobar actualizaciones (solo en producción, no en desarrollo)
        if (app.isPackaged) {
            autoUpdater.checkForUpdatesAndNotify();
        }
    });

    // Abrir links externos en el navegador del sistema
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ── Lifecycle ──────────────────────────────────────────────────
app.whenReady().then(createWindow).catch((err) => {
    console.error('[Electron] Error fatal:', err);
    app.quit();
});

app.on('window-all-closed', () => {
    if (serverInstance) {
        serverInstance.cleanup();
        serverInstance.server.close();
    }
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
