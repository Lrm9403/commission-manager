// app.js - Aplicación principal de Gestión de Comisiones

class SistemaComisiones {
    constructor() {
        this.usuario = null;
        this.empresaActual = null;
        this.configuracion = {
            tema: 'auto',
            moneda: 'USD',
            sincronizacionAuto: true,
            separadorMiles: ' ',
            separadorDecimal: '.'
        };
        this.cache = {
            empresas: [],
            contratos: [],
            certificaciones: [],
            pagos: []
        };
    }

    async init() {
        try {
            // Inicializar base de datos local
            await DB.init();
            
            // Cargar configuración
            await this.cargarConfiguracion();
            
            // Aplicar tema
            this.aplicarTema();
            
            // Verificar sesión existente
            await this.verificarSesion();
            
            // Inicializar sincronización
            Sync.init();
            
            // Configurar listeners
            this.configurarEventos();
            
            // Ocultar pantalla de carga
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
            }, 500);
            
        } catch (error) {
            console.error('Error al inicializar:', error);
            UI.showToast('Error al inicializar la aplicación', 'error');
        }
    }

    async cargarConfiguracion() {
        const config = await DB.getConfiguracion();
        if (config) {
            this.configuracion = config;
        }
        this.actualizarUIconfiguracion();
    }

    async verificarSesion() {
        const usuario = await DB.getUsuarioActual();
        if (usuario) {
            this.usuario = usuario;
            await this.cargarDatosUsuario();
            UI.showMainApp();
        } else {
            UI.showLogin();
        }
    }

    async cargarDatosUsuario() {
        try {
            // Actualizar avatar
            const iniciales = this.usuario.nombre
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase();
            document.getElementById('user-avatar').textContent = iniciales;
            
            // Cargar empresas del usuario
            await Empresas.cargarEmpresas();
            
            // Cargar dashboard si es necesario
            if (window.location.hash === '#dashboard') {
                await Dashboard.load();
            }
            
        } catch (error) {
            console.error('Error cargando datos usuario:', error);
        }
    }

    aplicarTema() {
        let tema = this.configuracion.tema;
        
        if (tema === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            tema = prefersDark ? 'dark' : 'light';
        }
        
        document.documentElement.setAttribute('data-theme', tema);
        document.getElementById('config-tema').value = this.configuracion.tema;
    }

    actualizarUIconfiguracion() {
        // Actualizar selectores de tema y moneda
        document.getElementById('config-tema').value = this.configuracion.tema;
        document.getElementById('config-moneda').value = this.configuracion.moneda;
        document.getElementById('config-sync').checked = this.configuracion.sincronizacionAuto;
        
        // Actualizar empresa actual si existe
        if (this.empresaActual) {
            document.getElementById('current-company').value = this.empresaActual.id;
        }
    }

    configurarEventos() {
        // Detectar cambios en conexión
        window.addEventListener('online', () => {
            Sync.syncPendingChanges();
            UI.updateSyncStatus('online');
        });

        window.addEventListener('offline', () => {
            UI.updateSyncStatus('offline');
        });

        // Detectar preferencias de tema del sistema
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (this.configuracion.tema === 'auto') {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });

        // Manejar hash changes para routing
        window.addEventListener('hashchange', this.handleHashChange.bind(this));
    }

    handleHashChange() {
        const hash = window.location.hash.replace('#', '');
        switch(hash) {
            case 'dashboard':
                Dashboard.show();
                break;
            case 'empresas':
                Empresas.show();
                break;
            case 'contratos':
                Contratos.show();
                break;
            case 'certificaciones':
                Certificaciones.show();
                break;
            case 'pagos':
                Pagos.show();
                break;
            case 'reportes':
                Reportes.show();
                break;
            case 'configuracion':
                Configuracion.show();
                break;
        }
    }

    // Formatear montos de dinero
    formatearDinero(monto, moneda = null) {
        const monedaUsar = moneda || this.configuracion.moneda;
        const simbolos = {
            'USD': '$',
            'CUP': '₱',
            'MXN': '$',
            'EUR': '€'
        };
        
        const simbolo = simbolos[monedaUsar] || '$';
        const separadorMiles = this.configuracion.separadorMiles;
        const separadorDecimal = this.configuracion.separadorDecimal;
        
        // Redondear a 2 decimales
        monto = parseFloat(monto) || 0;
        const partes = monto.toFixed(2).split('.');
        
        // Formatear parte entera con separadores de miles
        let parteEntera = partes[0];
        parteEntera = parteEntera.replace(/\B(?=(\d{3})+(?!\d))/g, separadorMiles);
        
        // Combinar con parte decimal
        return `${simbolo} ${parteEntera}${separadorDecimal}${partes[1]}`;
    }

    // Formatear porcentajes
    formatearPorcentaje(porcentaje) {
        porcentaje = parseFloat(porcentaje) || 0;
        return `${porcentaje.toFixed(2)}%`;
    }

    // Validar email
    validarEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Validar contraseña
    validarPassword(password) {
        return password.length >= 6;
    }

    // Generar ID único para offline
    generarIdLocal() {
        return 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// Instancia global de la aplicación
const App = new SistemaComisiones();

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => App.init());

// Módulo de UI
const UI = {
    showScreen(screenId) {
        // Ocultar todas las pantallas
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            screen.classList.add('hidden');
        });
        
        // Mostrar pantalla solicitada
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.remove('hidden');
            screen.classList.add('active');
        }
        
        // Actualizar navegación activa
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const navItem = document.querySelector(`[href="#${screenId.replace('-screen', '')}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }
    },

    showLogin() {
        this.showScreen('login-screen');
    },

    showMainApp() {
        // Ocultar login/register
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('register-screen').classList.remove('active');
        document.getElementById('register-screen').classList.add('hidden');
        
        // Mostrar sidebar y contenido principal
        document.querySelector('nav').style.display = 'flex';
        document.querySelector('main').style.display = 'block';
        document.querySelector('footer').style.display = 'flex';
        
        // Mostrar dashboard por defecto
        if (!window.location.hash) {
            window.location.hash = '#dashboard';
        }
    },

    showModal(title, content, onConfirm = null, confirmText = 'Confirmar') {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = content;
        document.getElementById('modal-confirm').textContent = confirmText;
        
        const modal = document.getElementById('modal');
        modal.classList.remove('hidden');
        modal.dataset.onConfirm = onConfirm ? onConfirm.toString() : '';
    },

    hideModal() {
        document.getElementById('modal').classList.add('hidden');
        document.getElementById('modal-body').innerHTML = '';
    },

    confirmModal() {
        const onConfirm = document.getElementById('modal').dataset.onConfirm;
        if (onConfirm && window[onConfirm]) {
            window[onConfirm]();
        }
        this.hideModal();
    },

    showToast(message, type = 'info', duration = 5000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${this.getToastIcon(type)}</span>
            <span class="toast-message">${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, duration);
    },

    getToastIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || 'ℹ️';
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        sidebar.classList.toggle('open');
        overlay.classList.toggle('hidden');
    },

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        
        // Guardar preferencia
        App.configuracion.tema = newTheme;
        DB.saveConfiguracion(App.configuracion);
    },

    updateSyncStatus(status) {
        const syncStatus = document.getElementById('sync-status');
        const syncText = syncStatus.querySelector('.sync-text');
        const syncIcon = syncStatus.querySelector('.sync-icon');
        
        syncStatus.className = `btn btn-sm btn-outline sync-${status}`;
        
        switch(status) {
            case 'online':
                syncText.textContent = 'Conectado';
                syncIcon.textContent = '✓';
                break;
            case 'offline':
                syncText.textContent = 'Offline';
                syncIcon.textContent = '⚠️';
                break;
            case 'syncing':
                syncText.textContent = 'Sincronizando...';
                syncIcon.textContent = '↻';
                break;
            case 'error':
                syncText.textContent = 'Error';
                syncIcon.textContent = '❌';
                break;
        }
    },

    crearElemento(tag, classes = '', content = '') {
        const element = document.createElement(tag);
        if (classes) element.className = classes;
        if (content) element.innerHTML = content;
        return element;
    },

    crearTabla(data, columns) {
        const table = document.createElement('table');
        table.className = 'table';
        
        // Crear encabezado
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col.title;
            if (col.width) th.style.width = col.width;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Crear cuerpo
        const tbody = document.createElement('tbody');
        
        data.forEach(item => {
            const row = document.createElement('tr');
            
            columns.forEach(col => {
                const td = document.createElement('td');
                
                if (typeof col.render === 'function') {
                    td.innerHTML = col.render(item);
                } else if (col.field) {
                    td.textContent = item[col.field];
                }
                
                row.appendChild(td);
            });
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        return table;
    }
};

// Módulo de Autenticación
const Auth = {
    async login(event) {
        event.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        
        if (!email || !password) {
            UI.showToast('Por favor completa todos los campos', 'error');
            return;
        }
        
        try {
            // Intentar login online primero
            const usuario = await Sync.login(email, password);
            
            if (usuario) {
                App.usuario = usuario;
                await DB.saveUsuario(usuario);
                await App.cargarDatosUsuario();
                UI.showMainApp();
                UI.showToast('¡Bienvenido!', 'success');
            }
        } catch (error) {
            console.error('Error en login:', error);
            UI.showToast('Credenciales incorrectas', 'error');
        }
    },

    async register(event) {
        event.preventDefault();
        
        const nombre = document.getElementById('register-nombre').value;
        const username = document.getElementById('register-username').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const confirm = document.getElementById('register-confirm').value;
        
        // Validaciones
        if (!nombre || !username || !email || !password || !confirm) {
            UI.showToast('Por favor completa todos los campos', 'error');
            return;
        }
        
        if (!App.validarEmail(email)) {
            UI.showToast('Email inválido', 'error');
            return;
        }
        
        if (!App.validarPassword(password)) {
            UI.showToast('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        
        if (password !== confirm) {
            UI.showToast('Las contraseñas no coinciden', 'error');
            return;
        }
        
        try {
            // Registrar en Supabase
            const usuario = await Sync.register(nombre, username, email, password);
            
            if (usuario) {
                App.usuario = usuario;
                await DB.saveUsuario(usuario);
                UI.showToast('¡Registro exitoso!', 'success');
                this.showLogin();
            }
        } catch (error) {
            console.error('Error en registro:', error);
            UI.showToast(error.message || 'Error al registrar usuario', 'error');
        }
    },

    async logout() {
        try {
            await Sync.logout();
            await DB.clearUsuario();
            App.usuario = null;
            App.empresaActual = null;
            UI.showLogin();
            UI.showToast('Sesión cerrada', 'info');
        } catch (error) {
            console.error('Error en logout:', error);
            UI.showToast('Error al cerrar sesión', 'error');
        }
    },

    showRegister() {
        UI.showScreen('register-screen');
    },

    showLogin() {
        UI.showScreen('login-screen');
    },

    showRecovery() {
        const content = `
            <div class="form-group">
                <label>Email de recuperación</label>
                <input type="email" id="recovery-email" class="input" 
                       placeholder="tu@email.com">
            </div>
            <p class="text-sm text-gray-600 mt-2">
                Te enviaremos un enlace para restablecer tu contraseña.
            </p>
        `;
        
        UI.showModal('Recuperar Contraseña', content, 'Auth.sendRecovery', 'Enviar Enlace');
    },

    async sendRecovery() {
        const email = document.getElementById('recovery-email').value;
        
        if (!email) {
            UI.showToast('Por favor ingresa tu email', 'error');
            return;
        }
        
        try {
            await Sync.sendPasswordRecovery(email);
            UI.hideModal();
            UI.showToast('Enlace de recuperación enviado', 'success');
        } catch (error) {
            UI.showToast('Error al enviar enlace de recuperación', 'error');
        }
    },

    showProfile() {
        if (!App.usuario) return;
        
        const content = `
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" id="profile-nombre" class="input" 
                       value="${App.usuario.nombre}">
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="profile-email" class="input" 
                       value="${App.usuario.email}" readonly>
            </div>
            <div class="form-group">
                <label>Nombre de Usuario</label>
                <input type="text" id="profile-username" class="input" 
                       value="${App.usuario.nombre_usuario}">
            </div>
        `;
        
        UI.showModal('Mi Perfil', content, 'Auth.updateProfile', 'Guardar Cambios');
    },

    async updateProfile() {
        const nombre = document.getElementById('profile-nombre').value;
        const username = document.getElementById('profile-username').value;
        
        if (!nombre || !username) {
            UI.showToast('Por favor completa todos los campos', 'error');
            return;
        }
        
        try {
            const updates = { nombre, nombre_usuario: username };
            const usuarioActualizado = await Sync.updateUsuario(updates);
            
            if (usuarioActualizado) {
                App.usuario = { ...App.usuario, ...updates };
                await DB.saveUsuario(App.usuario);
                UI.hideModal();
                UI.showToast('Perfil actualizado', 'success');
                
                // Actualizar avatar
                const iniciales = nombre
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase();
                document.getElementById('user-avatar').textContent = iniciales;
            }
        } catch (error) {
            UI.showToast('Error al actualizar perfil', 'error');
        }
    }
};

// Módulo de Empresas
const Empresas = {
    async cargarEmpresas() {
        try {
            const empresas = await Sync.getEmpresas();
            App.cache.empresas = empresas;
            this.renderEmpresasSelect(empresas);
            this.renderEmpresasTable(empresas);
        } catch (error) {
            console.error('Error cargando empresas:', error);
            UI.showToast('Error al cargar empresas', 'error');
        }
    },

    async selectCompany(empresaId) {
        if (!empresaId) {
            App.empresaActual = null;
            return;
        }
        
        const empresa = App.cache.empresas.find(e => e.id === empresaId);
        if (empresa) {
            App.empresaActual = empresa;
            
            // Actualizar en base de datos
            await DB.updateUsuarioActual({ empresa_actual: empresaId });
            
            // Recargar datos dependientes de la empresa
            await Contratos.load();
            await Certificaciones.load();
            await Pagos.load();
            await Dashboard.load();
            
            UI.showToast(`Empresa seleccionada: ${empresa.nombre}`, 'success');
        }
    },

    renderEmpresasSelect(empresas) {
        const select = document.getElementById('current-company');
        select.innerHTML = '<option value="">Seleccionar empresa</option>';
        
        empresas.forEach(empresa => {
            const option = document.createElement('option');
            option.value = empresa.id;
            option.textContent = empresa.nombre;
            if (App.empresaActual && empresa.id === App.empresaActual.id) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    },

    renderEmpresasTable(empresas) {
        const tbody = document.getElementById('empresas-table-body');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        empresas.forEach(empresa => {
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>
                    <div class="font-medium">${empresa.nombre}</div>
                    <div class="text-sm text-gray-600">${empresa.descripcion || 'Sin descripción'}</div>
                </td>
                <td>${empresa.director}</td>
                <td>${App.formatearPorcentaje(empresa.comision_default)}</td>
                <td>
                    <span class="badge ${empresa.estado === 'activa' ? 'badge-active' : 'badge-inactive'}">
                        ${empresa.estado === 'activa' ? 'Activa' : 'Inactiva'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="Empresas.editar('${empresa.id}')">
                        ✏️ Editar
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="Empresas.eliminar('${empresa.id}')">
                        🗑️ Eliminar
                    </button>
                </td>
            `;
            
            tbody.appendChild(tr);
        });
    },

    show() {
        UI.showScreen('empresas-screen');
        this.cargarEmpresas();
    },

    showForm(empresaId = null) {
        const empresa = empresaId ? App.cache.empresas.find(e => e.id === empresaId) : null;
        
        const content = `
            <div class="form-group">
                <label>Nombre de la Empresa *</label>
                <input type="text" id="empresa-nombre" class="input" 
                       value="${empresa ? empresa.nombre : ''}" required>
            </div>
            <div class="form-group">
                <label>Director *</label>
                <input type="text" id="empresa-director" class="input" 
                       value="${empresa ? empresa.director : ''}" required>
            </div>
            <div class="form-group">
                <label>Descripción</label>
                <textarea id="empresa-descripcion" class="input" rows="3">${empresa ? empresa.descripcion || '' : ''}</textarea>
            </div>
            <div class="form-group">
                <label>Comisión Predeterminada (%)</label>
                <input type="number" id="empresa-comision" class="input money-input" 
                       step="0.01" min="0" max="100"
                       value="${empresa ? empresa.comision_default : '1.00'}" required>
            </div>
            <div class="form-group">
                <label>Moneda Predeterminada</label>
                <select id="empresa-moneda" class="select">
                    <option value="USD" ${empresa && empresa.moneda_default === 'USD' ? 'selected' : ''}>USD ($)</option>
                    <option value="CUP" ${empresa && empresa.moneda_default === 'CUP' ? 'selected' : ''}>CUP (₱)</option>
                    <option value="MXN" ${empresa && empresa.moneda_default === 'MXN' ? 'selected' : ''}>MXN ($)</option>
                    <option value="EUR" ${empresa && empresa.moneda_default === 'EUR' ? 'selected' : ''}>EUR (€)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Estado</label>
                <select id="empresa-estado" class="select">
                    <option value="activa" ${empresa && empresa.estado === 'activa' ? 'selected' : ''}>Activa</option>
                    <option value="inactiva" ${empresa && empresa.estado === 'inactiva' ? 'selected' : ''}>Inactiva</option>
                </select>
            </div>
        `;
        
        const title = empresa ? 'Editar Empresa' : 'Nueva Empresa';
        const action = empresa ? 'Empresas.guardarEdicion' : 'Empresas.guardarNueva';
        
        UI.showModal(title, content, action, 'Guardar');
        
        if (empresaId) {
            document.getElementById('modal').dataset.empresaId = empresaId;
        }
    },

    async guardarNueva() {
        const empresa = {
            nombre: document.getElementById('empresa-nombre').value,
            director: document.getElementById('empresa-director').value,
            descripcion: document.getElementById('empresa-descripcion').value,
            comision_default: parseFloat(document.getElementById('empresa-comision').value) || 1.00,
            moneda_default: document.getElementById('empresa-moneda').value,
            estado: document.getElementById('empresa-estado').value,
            creado_por: App.usuario.id
        };
        
        if (!empresa.nombre || !empresa.director) {
            UI.showToast('Nombre y director son obligatorios', 'error');
            return;
        }
        
        try {
            const nuevaEmpresa = await Sync.createEmpresa(empresa);
            if (nuevaEmpresa) {
                await this.cargarEmpresas();
                UI.hideModal();
                UI.showToast('Empresa creada exitosamente', 'success');
            }
        } catch (error) {
            UI.showToast('Error al crear empresa', 'error');
        }
    },

    async guardarEdicion() {
        const empresaId = document.getElementById('modal').dataset.empresaId;
        if (!empresaId) return;
        
        const empresa = {
            nombre: document.getElementById('empresa-nombre').value,
            director: document.getElementById('empresa-director').value,
            descripcion: document.getElementById('empresa-descripcion').value,
            comision_default: parseFloat(document.getElementById('empresa-comision').value) || 1.00,
            moneda_default: document.getElementById('empresa-moneda').value,
            estado: document.getElementById('empresa-estado').value
        };
        
        try {
            const empresaActualizada = await Sync.updateEmpresa(empresaId, empresa);
            if (empresaActualizada) {
                await this.cargarEmpresas();
                UI.hideModal();
                UI.showToast('Empresa actualizada', 'success');
            }
        } catch (error) {
            UI.showToast('Error al actualizar empresa', 'error');
        }
    },

    editar(empresaId) {
        this.showForm(empresaId);
    },

    async eliminar(empresaId) {
        const empresa = App.cache.empresas.find(e => e.id === empresaId);
        if (!empresa) return;
        
        const content = `
            <p>¿Estás seguro de que deseas eliminar la empresa <strong>${empresa.nombre}</strong>?</p>
            <p class="text-sm text-danger mt-2">Esta acción no se puede deshacer.</p>
        `;
        
        UI.showModal('Eliminar Empresa', content, () => this.confirmarEliminacion(empresaId), 'Eliminar');
    },

    async confirmarEliminacion(empresaId) {
        try {
            await Sync.deleteEmpresa(empresaId);
            await this.cargarEmpresas();
            UI.hideModal();
            UI.showToast('Empresa eliminada', 'success');
        } catch (error) {
            UI.showToast('Error al eliminar empresa', 'error');
        }
    },

    search(query) {
        const empresas = App.cache.empresas.filter(empresa => 
            empresa.nombre.toLowerCase().includes(query.toLowerCase()) ||
            empresa.director.toLowerCase().includes(query.toLowerCase())
        );
        this.renderEmpresasTable(empresas);
    }
};

// Módulo de Contratos
const Contratos = {
    async load() {
        if (!App.empresaActual) {
            document.getElementById('contratos-list').innerHTML = 
                '<p class="empty-state">Selecciona una empresa para ver los contratos</p>';
            return;
        }
        
        try {
            const contratos = await Sync.getContratos(App.empresaActual.id);
            App.cache.contratos = contratos;
            this.renderContratos(contratos);
        } catch (error) {
            console.error('Error cargando contratos:', error);
            UI.showToast('Error al cargar contratos', 'error');
        }
    },

    renderContratos(contratos) {
        const container = document.getElementById('contratos-list');
        if (!container) return;
        
        if (contratos.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay contratos registrados</p>';
            return;
        }
        
        // Aplicar filtros
        const estadoFilter = document.getElementById('filter-estado').value;
        let contratosFiltrados = contratos;
        
        if (estadoFilter) {
            contratosFiltrados = contratos.filter(c => c.estado === estadoFilter);
        }
        
        // Crear tabla
        const columns = [
            { title: 'N° Contrato', field: 'numero_contrato', width: '150px' },
            { title: 'Nombre', field: 'nombre' },
            { title: 'Monto Base', field: 'monto_base', 
              render: c => App.formatearDinero(c.monto_base) },
            { title: 'Comisión', field: 'comision_porcentaje',
              render: c => App.formatearPorcentaje(c.comision_porcentaje) },
            { title: 'Progreso', field: 'progreso',
              render: c => this.renderProgreso(c.progreso) },
            { title: 'Estado', field: 'estado',
              render: c => this.renderEstado(c.estado) },
            { title: 'Acciones', width: '150px',
              render: c => this.renderAcciones(c) }
        ];
        
        const table = UI.crearTabla(contratosFiltrados, columns);
        container.innerHTML = '';
        container.appendChild(table);
    },

    renderProgreso(progreso) {
        return `
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progreso}%"></div>
                </div>
                <span class="text-sm ml-2">${progreso}%</span>
            </div>
        `;
    },

    renderEstado(estado) {
        const estados = {
            'activo': { clase: 'badge-active', texto: 'Activo' },
            'completado': { clase: 'badge-completado', texto: 'Completado' },
            'cancelado': { clase: 'badge-inactive', texto: 'Cancelado' },
            'pendiente': { clase: 'badge-pendiente', texto: 'Pendiente' }
        };
        
        const estadoInfo = estados[estado] || { clase: '', texto: estado };
        return `<span class="badge ${estadoInfo.clase}">${estadoInfo.texto}</span>`;
    },

    renderAcciones(contrato) {
        return `
            <button class="btn btn-sm btn-outline" onclick="Contratos.editar('${contrato.id}')">
                ✏️
            </button>
            <button class="btn btn-sm btn-outline" onclick="Contratos.verDetalles('${contrato.id}')">
                👁️
            </button>
            <button class="btn btn-sm btn-danger" onclick="Contratos.eliminar('${contrato.id}')">
                🗑️
            </button>
        `;
    },

    show() {
        UI.showScreen('contratos-screen');
        this.load();
    },

    showForm(contratoId = null) {
        if (!App.empresaActual) {
            UI.showToast('Selecciona una empresa primero', 'warning');
            return;
        }
        
        const contrato = contratoId ? App.cache.contratos.find(c => c.id === contratoId) : null;
        
        const content = `
            <div class="form-group">
                <label>Número de Contrato *</label>
                <input type="text" id="contrato-numero" class="input" 
                       value="${contrato ? contrato.numero_contrato : ''}" required>
            </div>
            <div class="form-group">
                <label>Nombre del Contrato *</label>
                <input type="text" id="contrato-nombre" class="input" 
                       value="${contrato ? contrato.nombre : ''}" required>
            </div>
            <div class="form-group">
                <label>Descripción</label>
                <textarea id="contrato-descripcion" class="input" rows="3">${contrato ? contrato.descripcion || '' : ''}</textarea>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                    <label>Monto Base *</label>
                    <input type="number" id="contrato-monto" class="input money-input" 
                           step="0.01" min="0" required
                           value="${contrato ? contrato.monto_base : '0'}">
                </div>
                <div class="form-group">
                    <label>Comisión (%) *</label>
                    <input type="number" id="contrato-comision" class="input" 
                           step="0.01" min="0" max="100" required
                           value="${contrato ? contrato.comision_porcentaje : App.empresaActual.comision_default}">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                    <label>Fecha Inicio *</label>
                    <input type="date" id="contrato-inicio" class="input" 
                           value="${contrato ? contrato.fecha_inicio : ''}" required>
                </div>
                <div class="form-group">
                    <label>Fecha Fin</label>
                    <input type="date" id="contrato-fin" class="input" 
                           value="${contrato ? contrato.fecha_fin || '' : ''}">
                </div>
            </div>
            <div class="form-group">
                <label>Estado</label>
                <select id="contrato-estado" class="select">
                    <option value="activo" ${contrato && contrato.estado === 'activo' ? 'selected' : ''}>Activo</option>
                    <option value="pendiente" ${contrato && contrato.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="completado" ${contrato && contrato.estado === 'completado' ? 'selected' : ''}>Completado</option>
                    <option value="cancelado" ${contrato && contrato.estado === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                </select>
            </div>
            <div class="form-group">
                <label>Datos Adicionales (JSON)</label>
                <textarea id="contrato-datos" class="input font-mono text-sm" rows="4">${contrato ? JSON.stringify(contrato.datos_adicionales, null, 2) : '{}'}</textarea>
            </div>
        `;
        
        const title = contrato ? 'Editar Contrato' : 'Nuevo Contrato';
        const action = contrato ? 'Contratos.guardarEdicion' : 'Contratos.guardarNuevo';
        
        UI.showModal(title, content, action, 'Guardar');
        
        if (contratoId) {
            document.getElementById('modal').dataset.contratoId = contratoId;
        }
    },

    async guardarNuevo() {
        if (!App.empresaActual) return;
        
        const contrato = {
            empresa_id: App.empresaActual.id,
            numero_contrato: document.getElementById('contrato-numero').value,
            nombre: document.getElementById('contrato-nombre').value,
            descripcion: document.getElementById('contrato-descripcion').value,
            monto_base: parseFloat(document.getElementById('contrato-monto').value) || 0,
            comision_porcentaje: parseFloat(document.getElementById('contrato-comision').value) || 1.00,
            fecha_inicio: document.getElementById('contrato-inicio').value,
            fecha_fin: document.getElementById('contrato-fin').value || null,
            estado: document.getElementById('contrato-estado').value,
            datos_adicionales: JSON.parse(document.getElementById('contrato-datos').value || '{}'),
            creado_por: App.usuario.id
        };
        
        // Validaciones
        if (!contrato.numero_contrato || !contrato.nombre || !contrato.fecha_inicio) {
            UI.showToast('Los campos marcados con * son obligatorios', 'error');
            return;
        }
        
        if (contrato.fecha_fin && contrato.fecha_inicio > contrato.fecha_fin) {
            UI.showToast('La fecha fin debe ser posterior a la fecha inicio', 'error');
            return;
        }
        
        try {
            const nuevoContrato = await Sync.createContrato(contrato);
            if (nuevoContrato) {
                await this.load();
                UI.hideModal();
                UI.showToast('Contrato creado exitosamente', 'success');
            }
        } catch (error) {
            UI.showToast('Error al crear contrato', 'error');
        }
    },

    async guardarEdicion() {
        const contratoId = document.getElementById('modal').dataset.contratoId;
        if (!contratoId) return;
        
        const contrato = {
            numero_contrato: document.getElementById('contrato-numero').value,
            nombre: document.getElementById('contrato-nombre').value,
            descripcion: document.getElementById('contrato-descripcion').value,
            monto_base: parseFloat(document.getElementById('contrato-monto').value) || 0,
            comision_porcentaje: parseFloat(document.getElementById('contrato-comision').value) || 1.00,
            fecha_inicio: document.getElementById('contrato-inicio').value,
            fecha_fin: document.getElementById('contrato-fin').value || null,
            estado: document.getElementById('contrato-estado').value,
            datos_adicionales: JSON.parse(document.getElementById('contrato-datos').value || '{}')
        };
        
        try {
            const contratoActualizado = await Sync.updateContrato(contratoId, contrato);
            if (contratoActualizado) {
                await this.load();
                UI.hideModal();
                UI.showToast('Contrato actualizado', 'success');
            }
        } catch (error) {
            UI.showToast('Error al actualizar contrato', 'error');
        }
    },

    editar(contratoId) {
        this.showForm(contratoId);
    },

    verDetalles(contratoId) {
        const contrato = App.cache.contratos.find(c => c.id === contratoId);
        if (!contrato) return;
        
        const content = `
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold">Información General</h4>
                    <p><strong>Número:</strong> ${contrato.numero_contrato}</p>
                    <p><strong>Nombre:</strong> ${contrato.nombre}</p>
                    <p><strong>Descripción:</strong> ${contrato.descripcion || 'No especificada'}</p>
                </div>
                <div>
                    <h4 class="font-semibold">Datos Financieros</h4>
                    <p><strong>Monto Base:</strong> ${App.formatearDinero(contrato.monto_base)}</p>
                    <p><strong>Comisión:</strong> ${App.formatearPorcentaje(contrato.comision_porcentaje)}</p>
                    <p><strong>Progreso:</strong> ${contrato.progreso}%</p>
                </div>
                <div>
                    <h4 class="font-semibold">Fechas</h4>
                    <p><strong>Inicio:</strong> ${contrato.fecha_inicio}</p>
                    <p><strong>Fin:</strong> ${contrato.fecha_fin || 'No definida'}</p>
                </div>
                <div>
                    <h4 class="font-semibold">Estado</h4>
                    ${this.renderEstado(contrato.estado)}
                </div>
            </div>
        `;
        
        UI.showModal('Detalles del Contrato', content, null, 'Cerrar');
    },

    async eliminar(contratoId) {
        const contrato = App.cache.contratos.find(c => c.id === contratoId);
        if (!contrato) return;
        
        const content = `
            <p>¿Estás seguro de que deseas eliminar el contrato <strong>${contrato.numero_contrato}</strong>?</p>
            <p class="text-sm text-danger mt-2">Esta acción eliminará también todas las certificaciones asociadas.</p>
        `;
        
        UI.showModal('Eliminar Contrato', content, () => this.confirmarEliminacion(contratoId), 'Eliminar');
    },

    async confirmarEliminacion(contratoId) {
        try {
            await Sync.deleteContrato(contratoId);
            await this.load();
            UI.hideModal();
            UI.showToast('Contrato eliminado', 'success');
        } catch (error) {
            UI.showToast('Error al eliminar contrato', 'error');
        }
    },

    search(query) {
        const contratos = App.cache.contratos.filter(contrato => 
            contrato.numero_contrato.toLowerCase().includes(query.toLowerCase()) ||
            contrato.nombre.toLowerCase().includes(query.toLowerCase())
        );
        this.renderContratos(contratos);
    }
};

// Módulo de Certificaciones
const Certificaciones = {
    async load() {
        if (!App.empresaActual) {
            document.getElementById('certificaciones-list').innerHTML = 
                '<p class="empty-state">Selecciona una empresa para ver las certificaciones</p>';
            return;
        }
        
        try {
            const certificaciones = await Sync.getCertificaciones(App.empresaActual.id);
            App.cache.certificaciones = certificaciones;
            this.renderCertificaciones(certificaciones);
            this.cargarFiltros();
        } catch (error) {
            console.error('Error cargando certificaciones:', error);
            UI.showToast('Error al cargar certificaciones', 'error');
        }
    },

    cargarFiltros() {
        // Cargar meses
        const meses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        
        const selectMes = document.getElementById('filter-mes');
        selectMes.innerHTML = '<option value="">Todos los meses</option>';
        meses.forEach((mes, index) => {
            const option = document.createElement('option');
            option.value = index + 1;
            option.textContent = mes;
            selectMes.appendChild(option);
        });
        
        // Cargar años
        const años = [...new Set(App.cache.certificaciones.map(c => c.año))].sort((a, b) => b - a);
        const selectYear = document.getElementById('filter-year');
        selectYear.innerHTML = '<option value="">Todos los años</option>';
        años.forEach(año => {
            const option = document.createElement('option');
            option.value = año;
            option.textContent = año;
            selectYear.appendChild(option);
        });
    },

    renderCertificaciones(certificaciones) {
        const container = document.getElementById('certificaciones-list');
        if (!container) return;
        
        if (certificaciones.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay certificaciones registradas</p>';
            return;
        }
        
        // Aplicar filtros
        const mesFilter = document.getElementById('filter-mes').value;
        const yearFilter = document.getElementById('filter-year').value;
        let certificacionesFiltradas = certificaciones;
        
        if (mesFilter) {
            certificacionesFiltradas = certificacionesFiltradas.filter(c => c.mes == mesFilter);
        }
        
        if (yearFilter) {
            certificacionesFiltradas = certificacionesFiltradas.filter(c => c.año == yearFilter);
        }
        
        // Crear tabla
        const columns = [
            { title: 'Mes/Año', width: '100px',
              render: c => `${c.mes}/${c.año}` },
            { title: 'Contrato', field: 'numero_contrato' },
            { title: 'Monto Certificado', 
              render: c => App.formatearDinero(c.monto_certificado) },
            { title: 'Comisión', 
              render: c => App.formatearPorcentaje(c.comision_porcentaje) },
            { title: 'Comisión Final', 
              render: c => App.formatearDinero(c.comision_final) },
            { title: 'Estado',
              render: c => this.renderEstado(c.estado) },
            { title: 'Acciones', width: '150px',
              render: c => this.renderAcciones(c) }
        ];
        
        // Obtener números de contrato para mostrar
        const certificacionesConContrato = certificacionesFiltradas.map(cert => {
            const contrato = App.cache.contratos.find(ctr => ctr.id === cert.contrato_id);
            return {
                ...cert,
                numero_contrato: contrato ? contrato.numero_contrato : 'N/A'
            };
        });
        
        const table = UI.crearTabla(certificacionesConContrato, columns);
        container.innerHTML = '';
        container.appendChild(table);
    },

    renderEstado(estado) {
        const estados = {
            'pendiente': { clase: 'badge-pendiente', texto: 'Pendiente' },
            'pagado': { clase: 'badge-active', texto: 'Pagado' },
            'cancelado': { clase: 'badge-inactive', texto: 'Cancelado' }
        };
        
        const estadoInfo = estados[estado] || { clase: '', texto: estado };
        return `<span class="badge ${estadoInfo.clase}">${estadoInfo.texto}</span>`;
    },

    renderAcciones(certificacion) {
        return `
            <button class="btn btn-sm btn-outline" onclick="Certificaciones.editar('${certificacion.id}')">
                ✏️
            </button>
            <button class="btn btn-sm btn-outline" onclick="Certificaciones.registrarPago('${certificacion.id}')">
                💰
            </button>
            <button class="btn btn-sm btn-danger" onclick="Certificaciones.eliminar('${certificacion.id}')">
                🗑️
            </button>
        `;
    },

    show() {
        UI.showScreen('certificaciones-screen');
        this.load();
    },

    showForm(certificacionId = null) {
        if (!App.empresaActual || App.cache.contratos.length === 0) {
            UI.showToast('Necesitas crear contratos primero', 'warning');
            return;
        }
        
        const certificacion = certificacionId ? 
            App.cache.certificaciones.find(c => c.id === certificacionId) : null;
        
        // Construir opciones de contratos
        let contratosOptions = '<option value="">Seleccionar contrato</option>';
        App.cache.contratos.forEach(contrato => {
            const selected = certificacion && certificacion.contrato_id === contrato.id ? 'selected' : '';
            contratosOptions += `<option value="${contrato.id}" ${selected}>${contrato.numero_contrato} - ${contrato.nombre}</option>`;
        });
        
        const content = `
            <div class="form-group">
                <label>Contrato *</label>
                <select id="certificacion-contrato" class="select" required>
                    ${contratosOptions}
                </select>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="form-group">
                    <label>Mes *</label>
                    <select id="certificacion-mes" class="select" required>
                        ${this.getMesesOptions(certificacion ? certificacion.mes : null)}
                    </select>
                </div>
                <div class="form-group">
                    <label>Año *</label>
                    <input type="number" id="certificacion-year" class="input" 
                           min="2000" max="2100" required
                           value="${certificacion ? certificacion.año : new Date().getFullYear()}">
                </div>
            </div>
            <div class="form-group">
                <label>Monto Certificado *</label>
                <input type="number" id="certificacion-monto" class="input money-input" 
                       step="0.01" min="0" required
                       value="${certificacion ? certificacion.monto_certificado : '0'}">
            </div>
            <div class="form-group">
                <label>Porcentaje de Comisión (%)</label>
                <input type="number" id="certificacion-porcentaje" class="input" 
                       step="0.01" min="0" max="100"
                       value="${certificacion ? certificacion.comision_porcentaje : App.empresaActual.comision_default}">
                <p class="text-sm text-gray-600 mt-1">
                    Déjalo vacío para usar el porcentaje del contrato (${App.empresaActual.comision_default}%)
                </p>
            </div>
            <div class="form-group">
                <label>Comisión Manual (opcional)</label>
                <input type="number" id="certificacion-comision-manual" class="input money-input" 
                       step="0.01" min="0"
                       value="${certificacion ? certificacion.comision_manual || '' : ''}">
                <p class="text-sm text-gray-600 mt-1">
                    Si especificas un valor aquí, se usará en lugar del cálculo automático
                </p>
            </div>
            <div class="form-group">
                <label>Fecha de Certificación *</label>
                <input type="date" id="certificacion-fecha" class="input" required
                       value="${certificacion ? certificacion.fecha_certificacion : new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Notas</label>
                <textarea id="certificacion-notas" class="input" rows="3">${certificacion ? certificacion.notas || '' : ''}</textarea>
            </div>
        `;
        
        const title = certificacion ? 'Editar Certificación' : 'Nueva Certificación';
        const action = certificacion ? 'Certificaciones.guardarEdicion' : 'Certificaciones.guardarNueva';
        
        UI.showModal(title, content, action, 'Guardar');
        
        if (certificacionId) {
            document.getElementById('modal').dataset.certificacionId = certificacionId;
        }
    },

    getMesesOptions(mesSeleccionado = null) {
        const meses = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        
        let options = '<option value="">Seleccionar mes</option>';
        meses.forEach((mes, index) => {
            const value = index + 1;
            const selected = mesSeleccionado === value ? 'selected' : '';
            options += `<option value="${value}" ${selected}>${mes}</option>`;
        });
        
        return options;
    },

    async guardarNueva() {
        if (!App.empresaActual) return;
        
        const contratoId = document.getElementById('certificacion-contrato').value;
        const contrato = App.cache.contratos.find(c => c.id === contratoId);
        
        if (!contrato) {
            UI.showToast('Selecciona un contrato válido', 'error');
            return;
        }
        
        const certificacion = {
            empresa_id: App.empresaActual.id,
            contrato_id: contratoId,
            mes: parseInt(document.getElementById('certificacion-mes').value),
            año: parseInt(document.getElementById('certificacion-year').value),
            monto_certificado: parseFloat(document.getElementById('certificacion-monto').value) || 0,
            comision_porcentaje: parseFloat(document.getElementById('certificacion-porcentaje').value) || contrato.comision_porcentaje,
            comision_manual: document.getElementById('certificacion-comision-manual').value ? 
                parseFloat(document.getElementById('certificacion-comision-manual').value) : null,
            fecha_certificacion: document.getElementById('certificacion-fecha').value,
            notas: document.getElementById('certificacion-notas').value,
            estado: 'pendiente',
            creado_por: App.usuario.id
        };
        
        // Validaciones
        if (!certificacion.mes || !certificacion.año || !certificacion.fecha_certificacion) {
            UI.showToast('Los campos marcados con * son obligatorios', 'error');
            return;
        }
        
        if (certificacion.mes < 1 || certificacion.mes > 12) {
            UI.showToast('Mes inválido', 'error');
            return;
        }
        
        try {
            const nuevaCertificacion = await Sync.createCertificacion(certificacion);
            if (nuevaCertificacion) {
                await this.load();
                await Contratos.load(); // Para actualizar progreso
                await Dashboard.load(); // Para actualizar dashboard
                UI.hideModal();
                UI.showToast('Certificación creada exitosamente', 'success');
            }
        } catch (error) {
            UI.showToast('Error al crear certificación', 'error');
        }
    },

    async guardarEdicion() {
        const certificacionId = document.getElementById('modal').dataset.certificacionId;
        if (!certificacionId) return;
        
        const certificacion = {
            mes: parseInt(document.getElementById('certificacion-mes').value),
            año: parseInt(document.getElementById('certificacion-year').value),
            monto_certificado: parseFloat(document.getElementById('certificacion-monto').value) || 0,
            comision_porcentaje: parseFloat(document.getElementById('certificacion-porcentaje').value) || App.empresaActual.comision_default,
            comision_manual: document.getElementById('certificacion-comision-manual').value ? 
                parseFloat(document.getElementById('certificacion-comision-manual').value) : null,
            fecha_certificacion: document.getElementById('certificacion-fecha').value,
            notas: document.getElementById('certificacion-notas').value,
            estado: 'pendiente'
        };
        
        try {
            const certificacionActualizada = await Sync.updateCertificacion(certificacionId, certificacion);
            if (certificacionActualizada) {
                await this.load();
                await Contratos.load();
                await Dashboard.load();
                UI.hideModal();
                UI.showToast('Certificación actualizada', 'success');
            }
        } catch (error) {
            UI.showToast('Error al actualizar certificación', 'error');
        }
    },

    editar(certificacionId) {
        this.showForm(certificacionId);
    },

    registrarPago(certificacionId) {
        const certificacion = App.cache.certificaciones.find(c => c.id === certificacionId);
        if (!certificacion) return;
        
        const content = `
            <div class="form-group">
                <label>Certificación</label>
                <p class="p-2 bg-gray-100 rounded">Mes: ${certificacion.mes}/${certificacion.año} - Monto: ${App.formatearDinero(certificacion.comision_final)}</p>
            </div>
            <div class="form-group">
                <label>Monto a Pagar *</label>
                <input type="number" id="pago-monto" class="input money-input" 
                       step="0.01" min="0" max="${certificacion.comision_final}"
                       value="${certificacion.comision_final}">
            </div>
            <div class="form-group">
                <label>Fecha de Pago *</label>
                <input type="date" id="pago-fecha" class="input" 
                       value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Método de Pago</label>
                <select id="pago-metodo" class="select">
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otro">Otro</option>
                </select>
            </div>
            <div class="form-group">
                <label>Referencia</label>
                <input type="text" id="pago-referencia" class="input" 
                       placeholder="N° de referencia o comprobante">
            </div>
        `;
        
        UI.showModal('Registrar Pago de Certificación', content, 
                     () => this.confirmarPago(certificacionId), 'Registrar Pago');
    },

    async confirmarPago(certificacionId) {
        const certificacion = App.cache.certificaciones.find(c => c.id === certificacionId);
        if (!certificacion) return;
        
        const pago = {
            empresa_id: App.empresaActual.id,
            tipo: 'especifico',
            monto_total: parseFloat(document.getElementById('pago-monto').value) || 0,
            fecha_pago: document.getElementById('pago-fecha').value,
            metodo_pago: document.getElementById('pago-metodo').value,
            referencia: document.getElementById('pago-referencia').value,
            descripcion: `Pago de certificación ${certificacion.mes}/${certificacion.año}`,
            estado: 'completado',
            creado_por: App.usuario.id
        };
        
        if (!pago.fecha_pago || pago.monto_total <= 0) {
            UI.showToast('Monto y fecha son obligatorios', 'error');
            return;
        }
        
        if (pago.monto_total > certificacion.comision_final) {
            UI.showToast('El monto no puede exceder la comisión pendiente', 'error');
            return;
        }
        
        try {
            // Crear pago
            const nuevoPago = await Sync.createPago(pago);
            
            if (nuevoPago) {
                // Actualizar estado de la certificación
                await Sync.updateCertificacion(certificacionId, { estado: 'pagado' });
                
                // Crear distribución de pago
                const distribucion = {
                    pago_id: nuevoPago.id,
                    contrato_id: certificacion.contrato_id,
                    certificacion_id: certificacionId,
                    monto_asignado: pago.monto_total,
                    porcentaje_asignado: 100,
                    creado_por: App.usuario.id
                };
                
                await Sync.createDistribucionPago(distribucion);
                
                // Recargar datos
                await this.load();
                await Pagos.load();
                await Dashboard.load();
                
                UI.hideModal();
                UI.showToast('Pago registrado exitosamente', 'success');
            }
        } catch (error) {
            UI.showToast('Error al registrar pago', 'error');
        }
    },

    async eliminar(certificacionId) {
        const certificacion = App.cache.certificaciones.find(c => c.id === certificacionId);
        if (!certificacion) return;
        
        const content = `
            <p>¿Estás seguro de que deseas eliminar la certificación del mes <strong>${certificacion.mes}/${certificacion.año}</strong>?</p>
        `;
        
        UI.showModal('Eliminar Certificación', content, 
                     () => this.confirmarEliminacion(certificacionId), 'Eliminar');
    },

    async confirmarEliminacion(certificacionId) {
        try {
            await Sync.deleteCertificacion(certificacionId);
            await this.load();
            await Contratos.load();
            await Dashboard.load();
            UI.hideModal();
            UI.showToast('Certificación eliminada', 'success');
        } catch (error) {
            UI.showToast('Error al eliminar certificación', 'error');
        }
    }
};

// Módulo de Pagos
const Pagos = {
    async load() {
        if (!App.empresaActual) {
            document.getElementById('pagos-list').innerHTML = 
                '<p class="empty-state">Selecciona una empresa para ver los pagos</p>';
            return;
        }
        
        try {
            const pagos = await Sync.getPagos(App.empresaActual.id);
            App.cache.pagos = pagos;
            this.renderPagos(pagos);
        } catch (error) {
            console.error('Error cargando pagos:', error);
            UI.showToast('Error al cargar pagos', 'error');
        }
    },

    renderPagos(pagos) {
        const container = document.getElementById('pagos-list');
        if (!container) return;
        
        if (pagos.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay pagos registrados</p>';
            return;
        }
        
        // Aplicar filtros
        const tipoFilter = document.getElementById('filter-tipo-pago').value;
        const fechaFilter = document.getElementById('filter-fecha-pago').value;
        let pagosFiltrados = pagos;
        
        if (tipoFilter) {
            pagosFiltrados = pagosFiltrados.filter(p => p.tipo === tipoFilter);
        }
        
        if (fechaFilter) {
            pagosFiltrados = pagosFiltrados.filter(p => p.fecha_pago === fechaFilter);
        }
        
        // Crear tabla
        const columns = [
            { title: 'Fecha', field: 'fecha_pago', width: '120px' },
            { title: 'Tipo', field: 'tipo',
              render: p => p.tipo === 'especifico' ? 'Específico' : 'Global' },
            { title: 'Monto Total', 
              render: p => App.formatearDinero(p.monto_total) },
            { title: 'Método', field: 'metodo_pago' },
            { title: 'Referencia', field: 'referencia' },
            { title: 'Estado',
              render: p => this.renderEstado(p.estado) },
            { title: 'Acciones', width: '150px',
              render: p => this.renderAcciones(p) }
        ];
        
        const table = UI.crearTabla(pagosFiltrados, columns);
        container.innerHTML = '';
        container.appendChild(table);
    },

    renderEstado(estado) {
        const estados = {
            'pendiente': { clase: 'badge-pendiente', texto: 'Pendiente' },
            'completado': { clase: 'badge-active', texto: 'Completado' },
            'cancelado': { clase: 'badge-inactive', texto: 'Cancelado' }
        };
        
        const estadoInfo = estados[estado] || { clase: '', texto: estado };
        return `<span class="badge ${estadoInfo.clase}">${estadoInfo.texto}</span>`;
    },

    renderAcciones(pago) {
        let acciones = `
            <button class="btn btn-sm btn-outline" onclick="Pagos.verDetalles('${pago.id}')">
                👁️
            </button>
        `;
        
        if (pago.estado === 'pendiente') {
            acciones += `
                <button class="btn btn-sm btn-success" onclick="Pagos.marcarCompletado('${pago.id}')">
                    ✅
                </button>
                <button class="btn btn-sm btn-danger" onclick="Pagos.eliminar('${pago.id}')">
                    🗑️
                </button>
            `;
        }
        
        return acciones;
    },

    show() {
        UI.showScreen('pagos-screen');
        this.load();
    },

    showForm(tipo = 'especifico') {
        if (!App.empresaActual) {
            UI.showToast('Selecciona una empresa primero', 'warning');
            return;
        }
        
        const title = tipo === 'especifico' ? 'Nuevo Pago Específico' : 'Nuevo Pago Global';
        let content = '';
        
        if (tipo === 'especifico') {
            content = this.getFormPagoEspecifico();
        } else {
            content = this.getFormPagoGlobal();
        }
        
        UI.showModal(title, content, () => this.guardarPago(tipo), 'Registrar Pago');
        document.getElementById('modal').dataset.tipoPago = tipo;
    },

    getFormPagoEspecifico() {
        // Obtener certificaciones pendientes para seleccionar
        let certificacionesOptions = '<option value="">Seleccionar certificación</option>';
        App.cache.certificaciones
            .filter(c => c.estado === 'pendiente')
            .forEach(cert => {
                const contrato = App.cache.contratos.find(c => c.id === cert.contrato_id);
                if (contrato) {
                    certificacionesOptions += `
                        <option value="${cert.id}" data-monto="${cert.comision_final}">
                            ${contrato.numero_contrato} - Mes ${cert.mes}/${cert.año} - ${App.formatearDinero(cert.comision_final)}
                        </option>
                    `;
                }
            });
        
        return `
            <div class="form-group">
                <label>Certificación a Pagar *</label>
                <select id="pago-certificacion" class="select" required>
                    ${certificacionesOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Monto a Pagar *</label>
                <input type="number" id="pago-monto" class="input money-input" 
                       step="0.01" min="0" required>
                <p class="text-sm text-gray-600 mt-1" id="monto-maximo"></p>
            </div>
            <div class="form-group">
                <label>Fecha de Pago *</label>
                <input type="date" id="pago-fecha" class="input" required
                       value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Método de Pago</label>
                <select id="pago-metodo" class="select">
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otro">Otro</option>
                </select>
            </div>
            <div class="form-group">
                <label>Referencia</label>
                <input type="text" id="pago-referencia" class="input" 
                       placeholder="N° de referencia o comprobante">
            </div>
            <div class="form-group">
                <label>Descripción</label>
                <textarea id="pago-descripcion" class="input" rows="2"></textarea>
            </div>
        `;
    },

    getFormPagoGlobal() {
        // Calcular saldo pendiente total
        const saldoPendiente = App.cache.certificaciones
            .filter(c => c.estado === 'pendiente')
            .reduce((sum, cert) => sum + cert.comision_final, 0);
        
        return `
            <div class="form-group">
                <label>Monto Total del Pago *</label>
                <input type="number" id="pago-monto-global" class="input money-input" 
                       step="0.01" min="0" max="${saldoPendiente}" required
                       placeholder="Monto total a distribuir">
                <p class="text-sm text-gray-600 mt-1">
                    Saldo pendiente total: ${App.formatearDinero(saldoPendiente)}
                </p>
            </div>
            <div class="form-group">
                <label>Fecha de Pago *</label>
                <input type="date" id="pago-fecha-global" class="input" required
                       value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Método de Pago</label>
                <select id="pago-metodo-global" class="select">
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                    <option value="tarjeta">Tarjeta</option>
                    <option value="otro">Otro</option>
                </select>
            </div>
            <div class="form-group">
                <label>Referencia</label>
                <input type="text" id="pago-referencia-global" class="input" 
                       placeholder="N° de referencia o comprobante">
            </div>
            <div class="form-group">
                <label>Descripción</label>
                <textarea id="pago-descripcion-global" class="input" rows="2"
                          placeholder="Descripción del pago global"></textarea>
            </div>
            <div class="mt-4 p-3 bg-gray-100 rounded">
                <p class="text-sm font-semibold">Distribución del Pago</p>
                <p class="text-sm text-gray-600 mt-1">
                    Después de registrar el pago, podrás distribuirlo entre las certificaciones pendientes.
                </p>
            </div>
        `;
    },

    async guardarPago(tipo) {
        if (!App.empresaActual) return;
        
        let pago;
        
        if (tipo === 'especifico') {
            const certificacionId = document.getElementById('pago-certificacion').value;
            const certificacion = App.cache.certificaciones.find(c => c.id === certificacionId);
            
            if (!certificacion) {
                UI.showToast('Selecciona una certificación válida', 'error');
                return;
            }
            
            pago = {
                empresa_id: App.empresaActual.id,
                tipo: 'especifico',
                monto_total: parseFloat(document.getElementById('pago-monto').value) || 0,
                fecha_pago: document.getElementById('pago-fecha').value,
                metodo_pago: document.getElementById('pago-metodo').value,
                referencia: document.getElementById('pago-referencia').value,
                descripcion: document.getElementById('pago-descripcion').value || 
                            `Pago de certificación ${certificacion.mes}/${certificacion.año}`,
                estado: 'pendiente',
                creado_por: App.usuario.id
            };
            
            // Validar que el monto no exceda la comisión pendiente
            if (pago.monto_total > certificacion.comision_final) {
                UI.showToast('El monto no puede exceder la comisión pendiente', 'error');
                return;
            }
            
        } else {
            pago = {
                empresa_id: App.empresaActual.id,
                tipo: 'global',
                monto_total: parseFloat(document.getElementById('pago-monto-global').value) || 0,
                fecha_pago: document.getElementById('pago-fecha-global').value,
                metodo_pago: document.getElementById('pago-metodo-global').value,
                referencia: document.getElementById('pago-referencia-global').value,
                descripcion: document.getElementById('pago-descripcion-global').value || 'Pago global',
                estado: 'pendiente',
                creado_por: App.usuario.id
            };
        }
        
        if (!pago.fecha_pago || pago.monto_total <= 0) {
            UI.showToast('Monto y fecha son obligatorios', 'error');
            return;
        }
        
        try {
            const nuevoPago = await Sync.createPago(pago);
            
            if (nuevoPago) {
                if (tipo === 'especifico') {
                    // Crear distribución automática para pago específico
                    const certificacionId = document.getElementById('pago-certificacion').value;
                    const certificacion = App.cache.certificaciones.find(c => c.id === certificacionId);
                    
                    const distribucion = {
                        pago_id: nuevoPago.id,
                        contrato_id: certificacion.contrato_id,
                        certificacion_id: certificacionId,
                        monto_asignado: pago.monto_total,
                        porcentaje_asignado: 100,
                        creado_por: App.usuario.id
                    };
                    
                    await Sync.createDistribucionPago(distribucion);
                }
                
                await this.load();
                UI.hideModal();
                UI.showToast('Pago registrado exitosamente', 'success');
                
                if (tipo === 'global') {
                    // Mostrar pantalla de distribución
                    this.distribuirPagoGlobal(nuevoPago.id);
                }
            }
        } catch (error) {
            UI.showToast('Error al registrar pago', 'error');
        }
    },

    async distribuirPagoGlobal(pagoId) {
        const pago = App.cache.pagos.find(p => p.id === pagoId);
        if (!pago || pago.tipo !== 'global') return;
        
        // Obtener certificaciones pendientes
        const certificacionesPendientes = App.cache.certificaciones
            .filter(c => c.estado === 'pendiente');
        
        if (certificacionesPendientes.length === 0) {
            UI.showToast('No hay certificaciones pendientes para distribuir', 'warning');
            return;
        }
        
        let content = `
            <div class="mb-4">
                <p class="font-semibold">Pago Global: ${App.formatearDinero(pago.monto_total)}</p>
                <p class="text-sm text-gray-600">Selecciona las certificaciones a pagar:</p>
            </div>
            <div id="distribucion-lista" class="space-y-3 max-h-60 overflow-y-auto">
        `;
        
        certificacionesPendientes.forEach(cert => {
            const contrato = App.cache.contratos.find(c => c.id === cert.contrato_id);
            const contratoNombre = contrato ? contrato.numero_contrato : 'N/A';
            
            content += `
                <div class="distribucion-item p-3 border rounded">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="font-medium">${contratoNombre} - Mes ${cert.mes}/${cert.año}</p>
                            <p class="text-sm text-gray-600">Comisión pendiente: ${App.formatearDinero(cert.comision_final)}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="number" 
                                   class="input w-32 money-input distribucion-monto" 
                                   data-certificacion-id="${cert.id}"
                                   data-maximo="${cert.comision_final}"
                                   placeholder="Monto"
                                   min="0" 
                                   max="${cert.comision_final}"
                                   step="0.01">
                            <button class="btn btn-sm btn-outline" onclick="Pagos.asignarMontoMaximo('${cert.id}')">
                                Máx
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        content += `
            </div>
            <div class="mt-4 p-3 bg-gray-100 rounded">
                <div class="flex justify-between items-center">
                    <span>Total asignado:</span>
                    <span id="total-asignado" class="font-semibold">$0</span>
                </div>
                <div class="flex justify-between items-center mt-2">
                    <span>Restante por asignar:</span>
                    <span id="restante-asignar" class="font-semibold">${App.formatearDinero(pago.monto_total)}</span>
                </div>
            </div>
            <p class="text-sm text-gray-600 mt-2">
                Asigna montos a las certificaciones. El total debe coincidir con el monto del pago.
            </p>
        `;
        
        UI.showModal('Distribuir Pago Global', content, 
                     () => this.guardarDistribucion(pagoId), 'Guardar Distribución');
        
        // Configurar listeners para calcular total
        document.querySelectorAll('.distribucion-monto').forEach(input => {
            input.addEventListener('input', () => this.calcularDistribucion(pago.monto_total));
        });
    },

    asignarMontoMaximo(certificacionId) {
        const input = document.querySelector(`.distribucion-monto[data-certificacion-id="${certificacionId}"]`);
        if (input) {
            input.value = input.dataset.maximo;
            this.calcularDistribucion();
        }
    },

    calcularDistribucion() {
        let totalAsignado = 0;
        const inputs = document.querySelectorAll('.distribucion-monto');
        
        inputs.forEach(input => {
            const monto = parseFloat(input.value) || 0;
            totalAsignado += monto;
        });
        
        const pago = App.cache.pagos.find(p => p.id === document.getElementById('modal').dataset.pagoId);
        if (!pago) return;
        
        const restante = pago.monto_total - totalAsignado;
        
        document.getElementById('total-asignado').textContent = App.formatearDinero(totalAsignado);
        document.getElementById('restante-asignar').textContent = App.formatearDinero(restante);
        
        // Cambiar color según el resultado
        const restanteElement = document.getElementById('restante-asignar');
        if (Math.abs(restante) < 0.01) {
            restanteElement.className = 'font-semibold text-success';
        } else if (restante > 0) {
            restanteElement.className = 'font-semibold text-warning';
        } else {
            restanteElement.className = 'font-semibold text-danger';
        }
    },

    async guardarDistribucion(pagoId) {
        const pago = App.cache.pagos.find(p => p.id === pagoId);
        if (!pago) return;
        
        const inputs = document.querySelectorAll('.distribucion-monto');
        let totalAsignado = 0;
        const distribuciones = [];
        
        // Calcular total y recolectar distribuciones
        inputs.forEach(input => {
            const monto = parseFloat(input.value) || 0;
            const certificacionId = input.dataset.certificacionId;
            
            if (monto > 0 && certificacionId) {
                totalAsignado += monto;
                distribuciones.push({
                    certificacionId,
                    monto
                });
            }
        });
        
        // Validar que el total coincida con el monto del pago
        if (Math.abs(totalAsignado - pago.monto_total) > 0.01) {
            UI.showToast('El total asignado debe coincidir con el monto del pago', 'error');
            return;
        }
        
        try {
            // Crear distribuciones
            for (const distrib of distribuciones) {
                const certificacion = App.cache.certificaciones.find(c => c.id === distrib.certificacionId);
                if (!certificacion) continue;
                
                const distribucion = {
                    pago_id: pagoId,
                    contrato_id: certificacion.contrato_id,
                    certificacion_id: distrib.certificacionId,
                    monto_asignado: distrib.monto,
                    porcentaje_asignado: (distrib.monto / pago.monto_total) * 100,
                    creado_por: App.usuario.id
                };
                
                await Sync.createDistribucionPago(distribucion);
                
                // Actualizar estado de la certificación si se pagó completamente
                if (Math.abs(distrib.monto - certificacion.comision_final) < 0.01) {
                    await Sync.updateCertificacion(distrib.certificacionId, { estado: 'pagado' });
                }
            }
            
            // Actualizar estado del pago
            await Sync.updatePago(pagoId, { estado: 'completado' });
            
            // Recargar datos
            await this.load();
            await Certificaciones.load();
            await Dashboard.load();
            
            UI.hideModal();
            UI.showToast('Distribución guardada exitosamente', 'success');
            
        } catch (error) {
            UI.showToast('Error al guardar distribución', 'error');
        }
    },

    verDetalles(pagoId) {
        const pago = App.cache.pagos.find(p => p.id === pagoId);
        if (!pago) return;
        
        const tipoTexto = pago.tipo === 'especifico' ? 'Específico' : 'Global';
        const metodoTexto = pago.metodo_pago ? pago.metodo_pago.charAt(0).toUpperCase() + pago.metodo_pago.slice(1) : 'No especificado';
        
        let content = `
            <div class="space-y-3">
                <div>
                    <p><strong>Tipo:</strong> ${tipoTexto}</p>
                    <p><strong>Monto:</strong> ${App.formatearDinero(pago.monto_total)}</p>
                    <p><strong>Fecha:</strong> ${pago.fecha_pago}</p>
                    <p><strong>Método:</strong> ${metodoTexto}</p>
                    ${pago.referencia ? `<p><strong>Referencia:</strong> ${pago.referencia}</p>` : ''}
                    ${pago.descripcion ? `<p><strong>Descripción:</strong> ${pago.descripcion}</p>` : ''}
                    <p><strong>Estado:</strong> ${this.renderEstado(pago.estado)}</p>
                </div>
        `;
        
        if (pago.tipo === 'global') {
            content += `
                <div class="mt-4">
                    <p class="font-semibold">Distribución del Pago:</p>
                    <div id="detalles-distribucion" class="mt-2">
                        <p class="text-sm text-gray-600">Cargando detalles...</p>
                    </div>
                </div>
            `;
        }
        
        content += '</div>';
        
        UI.showModal('Detalles del Pago', content, null, 'Cerrar');
        
        // Cargar detalles de distribución si es un pago global
        if (pago.tipo === 'global') {
            this.cargarDetallesDistribucion(pagoId);
        }
    },

    async cargarDetallesDistribucion(pagoId) {
        try {
            const distribuciones = await Sync.getDistribucionesPago(pagoId);
            const container = document.getElementById('detalles-distribucion');
            
            if (!distribuciones || distribuciones.length === 0) {
                container.innerHTML = '<p class="text-sm text-gray-600">No hay distribución registrada</p>';
                return;
            }
            
            let html = '<div class="space-y-2">';
            
            for (const dist of distribuciones) {
                const certificacion = App.cache.certificaciones.find(c => c.id === dist.certificacion_id);
                const contrato = App.cache.contratos.find(c => c.id === dist.contrato_id);
                
                if (certificacion && contrato) {
                    html += `
                        <div class="p-2 border rounded">
                            <p class="font-medium">${contrato.numero_contrato} - Mes ${certificacion.mes}/${certificacion.año}</p>
                            <p class="text-sm text-gray-600">
                                Monto asignado: ${App.formatearDinero(dist.monto_asignado)}
                                ${dist.porcentaje_asignado ? `(${dist.porcentaje_asignado.toFixed(2)}%)` : ''}
                            </p>
                        </div>
                    `;
                }
            }
            
            html += '</div>';
            container.innerHTML = html;
            
        } catch (error) {
            console.error('Error cargando detalles de distribución:', error);
            document.getElementById('detalles-distribucion').innerHTML = 
                '<p class="text-sm text-red-600">Error al cargar detalles</p>';
        }
    },

    async marcarCompletado(pagoId) {
        try {
            await Sync.updatePago(pagoId, { estado: 'completado' });
            await this.load();
            UI.showToast('Pago marcado como completado', 'success');
        } catch (error) {
            UI.showToast('Error al actualizar pago', 'error');
        }
    },

    async eliminar(pagoId) {
        const pago = App.cache.pagos.find(p => p.id === pagoId);
        if (!pago) return;
        
        const content = `
            <p>¿Estás seguro de que deseas eliminar este pago?</p>
            <p class="text-sm text-danger mt-2">Esta acción eliminará también todas las distribuciones asociadas.</p>
        `;
        
        UI.showModal('Eliminar Pago', content, 
                     () => this.confirmarEliminacion(pagoId), 'Eliminar');
    },

    async confirmarEliminacion(pagoId) {
        try {
            await Sync.deletePago(pagoId);
            await this.load();
            UI.hideModal();
            UI.showToast('Pago eliminado', 'success');
        } catch (error) {
            UI.showToast('Error al eliminar pago', 'error');
        }
    }
};

// Módulo de Dashboard
const Dashboard = {
    async load() {
        if (!App.usuario) return;
        
        try {
            // Cargar estadísticas
            await this.cargarEstadisticas();
            
            // Cargar gráficos
            await this.cargarGraficos();
            
            // Cargar actividades recientes
            await this.cargarActividades();
            
        } catch (error) {
            console.error('Error cargando dashboard:', error);
        }
    },

    async cargarEstadisticas() {
        if (!App.empresaActual) {
            this.mostrarEstadisticasVacias();
            return;
        }
        
        try {
            const estadisticas = await Sync.getEstadisticas(App.empresaActual.id);
            
            document.getElementById('total-contratos').textContent = 
                estadisticas.total_contratos || 0;
            
            document.getElementById('comisiones-pendientes').textContent = 
                App.formatearDinero(estadisticas.comisiones_pendientes || 0);
            
            document.getElementById('comisiones-pagadas').textContent = 
                App.formatearDinero(estadisticas.comisiones_pagadas || 0);
            
            document.getElementById('progreso-promedio').textContent = 
                estadisticas.progreso_promedio ? 
                `${estadisticas.progreso_promedio.toFixed(1)}%` : '0%';
                
        } catch (error) {
            console.error('Error cargando estadísticas:', error);
            this.mostrarEstadisticasVacias();
        }
    },

    mostrarEstadisticasVacias() {
        document.getElementById('total-contratos').textContent = '0';
        document.getElementById('comisiones-pendientes').textContent = App.formatearDinero(0);
        document.getElementById('comisiones-pagadas').textContent = App.formatearDinero(0);
        document.getElementById('progreso-promedio').textContent = '0%';
    },

    async cargarGraficos() {
        if (!App.empresaActual) return;
        
        try {
            // Datos para gráfico de comisiones por mes
            const comisionesPorMes = await Sync.getComisionesPorMes(App.empresaActual.id);
            this.crearGraficoComisiones(comisionesPorMes);
            
            // Datos para gráfico de estado de contratos
            const estadoContratos = await Sync.getEstadoContratos(App.empresaActual.id);
            this.crearGraficoContratos(estadoContratos);
            
        } catch (error) {
            console.error('Error cargando gráficos:', error);
        }
    },

    crearGraficoComisiones(datos) {
        const canvas = document.getElementById('chart-comisiones');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Si no hay datos, mostrar mensaje
        if (!datos || datos.length === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = '#6b7280';
            ctx.textAlign = 'center';
            ctx.fillText('No hay datos para mostrar', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // Preparar datos
        const meses = datos.map(d => `${d.mes}/${d.año}`);
        const comisiones = datos.map(d => d.comision_total);
        
        // Configuración del gráfico
        const padding = 40;
        const width = canvas.width - padding * 2;
        const height = canvas.height - padding * 2;
        
        const maxComision = Math.max(...comisiones, 1);
        const barWidth = width / meses.length * 0.8;
        const barSpacing = width / meses.length * 0.2;
        
        // Dibujar ejes
        ctx.beginPath();
        ctx.moveTo(padding, padding);
        ctx.lineTo(padding, canvas.height - padding);
        ctx.lineTo(canvas.width - padding, canvas.height - padding);
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Dibujar barras
        meses.forEach((mes, index) => {
            const x = padding + index * (barWidth + barSpacing) + barSpacing / 2;
            const barHeight = (comisiones[index] / maxComision) * height;
            const y = canvas.height - padding - barHeight;
            
            // Barra
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(x, y, barWidth, barHeight);
            
            // Etiqueta del mes
            ctx.save();
            ctx.translate(x + barWidth / 2, canvas.height - padding + 15);
            ctx.rotate(-Math.PI / 4);
            ctx.font = '10px Arial';
            ctx.fillStyle = '#6b7280';
            ctx.textAlign = 'right';
            ctx.fillText(mes, 0, 0);
            ctx.restore();
            
            // Valor
            ctx.font = '10px Arial';
            ctx.fillStyle = '#1f2937';
            ctx.textAlign = 'center';
            ctx.fillText(App.formatearDinero(comisiones[index]), 
                        x + barWidth / 2, y - 5);
        });
        
        // Título del eje Y
        ctx.save();
        ctx.translate(15, canvas.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = '12px Arial';
        ctx.fillStyle = '#374151';
        ctx.textAlign = 'center';
        ctx.fillText('Comisiones ($)', 0, 0);
        ctx.restore();
    },

    crearGraficoContratos(datos) {
        const canvas = document.getElementById('chart-contratos');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Si no hay datos, mostrar mensaje
        if (!datos || datos.length === 0) {
            ctx.font = '14px Arial';
            ctx.fillStyle = '#6b7280';
            ctx.textAlign = 'center';
            ctx.fillText('No hay datos para mostrar', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        // Colores para los estados
        const colores = {
            'activo': '#10b981',
            'completado': '#3b82f6',
            'cancelado': '#ef4444',
            'pendiente': '#f59e0b'
        };
        
        // Calcular total
        const total = datos.reduce((sum, d) => sum + d.cantidad, 0);
        
        // Dibujar gráfico de pastel
        let anguloInicio = 0;
        const centroX = canvas.width / 2;
        const centroY = canvas.height / 2;
        const radio = Math.min(centroX, centroY) - 30;
        
        datos.forEach((item, index) => {
            const angulo = (item.cantidad / total) * 2 * Math.PI;
            const anguloMedio = anguloInicio + angulo / 2;
            
            // Sector
            ctx.beginPath();
            ctx.moveTo(centroX, centroY);
            ctx.arc(centroX, centroY, radio, anguloInicio, anguloInicio + angulo);
            ctx.closePath();
            ctx.fillStyle = colores[item.estado] || '#9ca3af';
            ctx.fill();
            
            // Leyenda
            const leyendaX = 20;
            const leyendaY = 20 + index * 20;
            
            // Cuadrado de color
            ctx.fillStyle = colores[item.estado] || '#9ca3af';
            ctx.fillRect(leyendaX, leyendaY - 10, 12, 12);
            
            // Texto
            ctx.fillStyle = '#374151';
            ctx.font = '12px Arial';
            ctx.fillText(`${item.estado}: ${item.cantidad} (${(item.cantidad / total * 100).toFixed(1)}%)`, 
                        leyendaX + 20, leyendaY);
            
            // Línea al sector
            const puntoX = centroX + Math.cos(anguloMedio) * radio * 0.7;
            const puntoY = centroY + Math.sin(anguloMedio) * radio * 0.7;
            
            ctx.beginPath();
            ctx.moveTo(puntoX, puntoY);
            ctx.lineTo(puntoX + Math.cos(anguloMedio) * 30, 
                      puntoY + Math.sin(anguloMedio) * 30);
            ctx.strokeStyle = colores[item.estado] || '#9ca3af';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            anguloInicio += angulo;
        });
    },

    async cargarActividades() {
        const container = document.getElementById('ultimas-actividades');
        if (!container) return;
        
        try {
            const actividades = await Sync.getActividadesRecientes();
            
            if (!actividades || actividades.length === 0) {
                container.innerHTML = `
                    <div class="activity-item">
                        <div class="activity-icon">📝</div>
                        <div class="activity-content">
                            <p>No hay actividades recientes</p>
                        </div>
                    </div>
                `;
                return;
            }
            
            let html = '';
            actividades.forEach(actividad => {
                const icono = this.getIconoActividad(actividad.accion);
                const fecha = new Date(actividad.creado_en).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                html += `
                    <div class="activity-item">
                        <div class="activity-icon">${icono}</div>
                        <div class="activity-content">
                            <p class="font-medium">${actividad.descripcion}</p>
                            <p class="text-sm text-gray-600">${fecha}</p>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
            
        } catch (error) {
            console.error('Error cargando actividades:', error);
            container.innerHTML = `
                <div class="activity-item">
                    <div class="activity-icon">⚠️</div>
                    <div class="activity-content">
                        <p>Error al cargar actividades</p>
                    </div>
                </div>
            `;
        }
    },

    getIconoActividad(accion) {
        const iconos = {
            'CREATE': '➕',
            'UPDATE': '✏️',
            'DELETE': '🗑️',
            'LOGIN': '🔐',
            'PAYMENT': '💰',
            'CERTIFICATION': '📋'
        };
        return iconos[accion] || '📝';
    },

    show() {
        UI.showScreen('dashboard-screen');
        this.load();
    }
};

// Módulo de Reportes
const Reportes = {
    async generar() {
        const fechaInicio = document.getElementById('reporte-fecha-inicio').value;
        const fechaFin = document.getElementById('reporte-fecha-fin').value;
        const tipo = document.getElementById('reporte-tipo').value;
        
        if (!fechaInicio || !fechaFin) {
            UI.showToast('Selecciona un rango de fechas', 'warning');
            return;
        }
        
        try {
            let datos;
            
            switch(tipo) {
                case 'comisiones':
                    datos = await this.generarReporteComisiones(fechaInicio, fechaFin);
                    break;
                case 'pagos':
                    datos = await this.generarReportePagos(fechaInicio, fechaFin);
                    break;
                case 'contratos':
                    datos = await this.generarReporteContratos(fechaInicio, fechaFin);
                    break;
            }
            
            this.mostrarPreview(datos, tipo);
            
        } catch (error) {
            console.error('Error generando reporte:', error);
            UI.showToast('Error al generar reporte', 'error');
        }
    },

    async generarReporteComisiones(fechaInicio, fechaFin) {
        if (!App.empresaActual) return [];
        
        const certificaciones = App.cache.certificaciones.filter(cert => {
            const fechaCert = new Date(cert.fecha_certificacion);
            const fechaIni = new Date(fechaInicio);
            const fechaEnd = new Date(fechaFin);
            return fechaCert >= fechaIni && fechaCert <= fechaEnd;
        });
        
        return certificaciones.map(cert => {
            const contrato = App.cache.contratos.find(c => c.id === cert.contrato_id);
            return {
                'Contrato': contrato ? contrato.numero_contrato : 'N/A',
                'Mes/Año': `${cert.mes}/${cert.año}`,
                'Monto Certificado': App.formatearDinero(cert.monto_certificado),
                'Comisión %': App.formatearPorcentaje(cert.comision_porcentaje),
                'Comisión Final': App.formatearDinero(cert.comision_final),
                'Estado': cert.estado,
                'Fecha Certificación': cert.fecha_certificacion
            };
        });
    },

    async generarReportePagos(fechaInicio, fechaFin) {
        if (!App.empresaActual) return [];
        
        const pagos = App.cache.pagos.filter(pago => {
            const fechaPago = new Date(pago.fecha_pago);
            const fechaIni = new Date(fechaInicio);
            const fechaEnd = new Date(fechaFin);
            return fechaPago >= fechaIni && fechaPago <= fechaEnd;
        });
        
        return pagos.map(pago => ({
            'Fecha': pago.fecha_pago,
            'Tipo': pago.tipo === 'especifico' ? 'Específico' : 'Global',
            'Monto': App.formatearDinero(pago.monto_total),
            'Método': pago.metodo_pago || 'No especificado',
            'Referencia': pago.referencia || '',
            'Descripción': pago.descripcion || '',
            'Estado': pago.estado
        }));
    },

    async generarReporteContratos(fechaInicio, fechaFin) {
        if (!App.empresaActual) return [];
        
        const contratos = App.cache.contratos.filter(contrato => {
            const fechaIniContrato = new Date(contrato.fecha_inicio);
            const fechaIni = new Date(fechaInicio);
            const fechaEnd = new Date(fechaFin);
            return fechaIniContrato >= fechaIni && fechaIniContrato <= fechaEnd;
        });
        
        return contratos.map(contrato => ({
            'Número': contrato.numero_contrato,
            'Nombre': contrato.nombre,
            'Monto Base': App.formatearDinero(contrato.monto_base),
            'Comisión %': App.formatearPorcentaje(contrato.comision_porcentaje),
            'Progreso': `${contrato.progreso}%`,
            'Fecha Inicio': contrato.fecha_inicio,
            'Fecha Fin': contrato.fecha_fin || 'No definida',
            'Estado': contrato.estado
        }));
    },

    mostrarPreview(datos, tipo) {
        const container = document.getElementById('reporte-preview');
        
        if (!datos || datos.length === 0) {
            container.innerHTML = '<p class="empty-state">No hay datos para el rango seleccionado</p>';
            return;
        }
        
        // Crear tabla
        const headers = Object.keys(datos[0]);
        let html = '<table class="table"><thead><tr>';
        
        headers.forEach(header => {
            html += `<th>${header}</th>`;
        });
        
        html += '</tr></thead><tbody>';
        
        datos.forEach(fila => {
            html += '<tr>';
            headers.forEach(header => {
                html += `<td>${fila[header]}</td>`;
            });
            html += '</tr>';
        });
        
        html += '</tbody></table>';
        
        // Agregar resumen
        const resumen = `
            <div class="mt-4 p-3 bg-gray-100 rounded">
                <p><strong>Resumen:</strong> ${datos.length} registros encontrados</p>
                <p><strong>Tipo:</strong> ${this.getNombreTipoReporte(tipo)}</p>
            </div>
        `;
        
        container.innerHTML = html + resumen;
    },

    getNombreTipoReporte(tipo) {
        const nombres = {
            'comisiones': 'Comisiones',
            'pagos': 'Pagos',
            'contratos': 'Contratos'
        };
        return nombres[tipo] || tipo;
    },

    async exportJSON() {
        if (!App.empresaActual) {
            UI.showToast('Selecciona una empresa primero', 'warning');
            return;
        }
        
        try {
            const exportData = {
                empresa: App.empresaActual,
                contratos: App.cache.contratos,
                certificaciones: App.cache.certificaciones,
                pagos: App.cache.pagos,
                fechaExportacion: new Date().toISOString(),
                version: '1.0'
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], 
                                { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `comisiones_${App.empresaActual.nombre}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            UI.showToast('Exportación JSON completada', 'success');
            
        } catch (error) {
            console.error('Error exportando JSON:', error);
            UI.showToast('Error al exportar JSON', 'error');
        }
    },

    async exportCSV() {
        if (!App.empresaActual) {
            UI.showToast('Selecciona una empresa primero', 'warning');
            return;
        }
        
        try {
            // Exportar certificaciones a CSV
            const datos = App.cache.certificaciones.map(cert => {
                const contrato = App.cache.contratos.find(c => c.id === cert.contrato_id);
                return {
                    'Contrato': contrato ? contrato.numero_contrato : 'N/A',
                    'Mes': cert.mes,
                    'Año': cert.año,
                    'Monto Certificado': cert.monto_certificado,
                    'Comisión %': cert.comision_porcentaje,
                    'Comisión Final': cert.comision_final,
                    'Estado': cert.estado,
                    'Fecha Certificación': cert.fecha_certificacion
                };
            });
            
            if (datos.length === 0) {
                UI.showToast('No hay datos para exportar', 'warning');
                return;
            }
            
            // Crear CSV
            const headers = Object.keys(datos[0]);
            const csvRows = [
                headers.join(','),
                ...datos.map(row => 
                    headers.map(header => {
                        const value = row[header];
                        // Escapar comas y comillas
                        const escaped = ('' + value).replace(/"/g, '""');
                        return `"${escaped}"`;
                    }).join(',')
                )
            ];
            
            const csvString = csvRows.join('\n');
            const blob = new Blob([csvString], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `certificaciones_${App.empresaActual.nombre}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            UI.showToast('Exportación CSV completada', 'success');
            
        } catch (error) {
            console.error('Error exportando CSV:', error);
            UI.showToast('Error al exportar CSV', 'error');
        }
    },

    show() {
        UI.showScreen('reportes-screen');
    }
};

// Módulo de Configuración
const Configuracion = {
    async show() {
        if (!App.usuario) return;
        
        // Cargar datos del usuario en el formulario
        document.getElementById('config-nombre').value = App.usuario.nombre;
        document.getElementById('config-email').value = App.usuario.email;
        document.getElementById('config-username').value = App.usuario.nombre_usuario;
        
        // Cargar configuración actual
        document.getElementById('config-tema').value = App.configuracion.tema;
        document.getElementById('config-moneda').value = App.configuracion.moneda;
        document.getElementById('config-sync').checked = App.configuracion.sincronizacionAuto;
        
        UI.showScreen('configuracion-screen');
    },

    async updateProfile() {
        const nombre = document.getElementById('config-nombre').value;
        const username = document.getElementById('config-username').value;
        
        if (!nombre || !username) {
            UI.showToast('Nombre y usuario son obligatorios', 'error');
            return;
        }
        
        try {
            const updates = { nombre, nombre_usuario: username };
            const usuarioActualizado = await Sync.updateUsuario(updates);
            
            if (usuarioActualizado) {
                App.usuario = { ...App.usuario, ...updates };
                await DB.saveUsuario(App.usuario);
                UI.showToast('Perfil actualizado', 'success');
            }
        } catch (error) {
            UI.showToast('Error al actualizar perfil', 'error');
        }
    },

    updateTema(tema) {
        App.configuracion.tema = tema;
        DB.saveConfiguracion(App.configuracion);
        App.aplicarTema();
        UI.showToast('Tema actualizado', 'success');
    },

    updateMoneda(moneda) {
        App.configuracion.moneda = moneda;
        DB.saveConfiguracion(App.configuracion);
        UI.showToast('Moneda actualizada', 'success');
    },

    toggleSync(activado) {
        App.configuracion.sincronizacionAuto = activado;
        DB.saveConfiguracion(App.configuracion);
        
        if (activado) {
            Sync.syncPendingChanges();
            UI.showToast('Sincronización automática activada', 'success');
        } else {
            UI.showToast('Sincronización automática desactivada', 'info');
        }
    },

    async exportBackup() {
        try {
            const backupData = await DB.exportBackup();
            const blob = new Blob([JSON.stringify(backupData, null, 2)], 
                                { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_comisiones_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            UI.showToast('Backup exportado exitosamente', 'success');
            
        } catch (error) {
            console.error('Error exportando backup:', error);
            UI.showToast('Error al exportar backup', 'error');
        }
    },

    async importBackup(file) {
        if (!file) return;
        
        try {
            const text = await file.text();
            const backupData = JSON.parse(text);
            
            const content = `
                <p>¿Estás seguro de que deseas importar el backup?</p>
                <p class="text-sm text-danger mt-2">
                    Esta acción sobrescribirá tus datos actuales.
                </p>
                <div class="mt-3 p-2 bg-gray-100 rounded">
                    <p class="text-sm"><strong>Archivo:</strong> ${file.name}</p>
                    <p class="text-sm"><strong>Tamaño:</strong> ${(file.size / 1024).toFixed(2)} KB</p>
                </div>
            `;
            
            UI.showModal('Importar Backup', content, 
                        () => this.confirmarImportacion(backupData), 'Importar');
            
        } catch (error) {
            console.error('Error importando backup:', error);
            UI.showToast('Error al leer el archivo de backup', 'error');
        }
    },

    async confirmarImportacion(backupData) {
        try {
            await DB.importBackup(backupData);
            
            // Recargar datos
            if (backupData.usuario) {
                App.usuario = backupData.usuario;
                await App.cargarDatosUsuario();
            }
            
            UI.hideModal();
            UI.showToast('Backup importado exitosamente', 'success');
            
        } catch (error) {
            UI.showToast('Error al importar backup', 'error');
        }
    },

    showChangePassword() {
        const content = `
            <div class="form-group">
                <label>Contraseña Actual</label>
                <input type="password" id="current-password" class="input" required>
            </div>
            <div class="form-group">
                <label>Nueva Contraseña</label>
                <input type="password" id="new-password" class="input" required minlength="6">
            </div>
            <div class="form-group">
                <label>Confirmar Nueva Contraseña</label>
                <input type="password" id="confirm-password" class="input" required>
            </div>
        `;
        
        UI.showModal('Cambiar Contraseña', content, 
                     'Configuracion.updatePassword', 'Cambiar');
    },

    async updatePassword() {
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            UI.showToast('Todos los campos son obligatorios', 'error');
            return;
        }
        
        if (newPassword.length < 6) {
            UI.showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            UI.showToast('Las nuevas contraseñas no coinciden', 'error');
            return;
        }
        
        try {
            await Sync.changePassword(currentPassword, newPassword);
            UI.hideModal();
            UI.showToast('Contraseña cambiada exitosamente', 'success');
            
        } catch (error) {
            UI.showToast('Error al cambiar contraseña', 'error');
        }
    },

    deleteAccount() {
        const content = `
            <p class="text-danger font-semibold">¡ADVERTENCIA!</p>
            <p>¿Estás seguro de que deseas eliminar tu cuenta?</p>
            <p class="text-sm text-danger mt-2">
                Esta acción eliminará permanentemente:
                <ul class="list-disc list-inside mt-1 text-sm">
                    <li>Tu cuenta de usuario</li>
                    <li>Todas las empresas que hayas creado</li>
                    <li>Todos los contratos, certificaciones y pagos asociados</li>
                </ul>
            </p>
            <p class="mt-3">Esta acción NO se puede deshacer.</p>
            <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <p class="text-sm text-red-700">Escribe "ELIMINAR" para confirmar:</p>
                <input type="text" id="confirm-delete" class="input mt-2" 
                       placeholder="ELIMINAR">
            </div>
        `;
        
        UI.showModal('Eliminar Cuenta', content, 
                     'Configuracion.confirmarEliminacionCuenta', 'Eliminar Cuenta');
    },

    async confirmarEliminacionCuenta() {
        const confirmacion = document.getElementById('confirm-delete').value;
        
        if (confirmacion !== 'ELIMINAR') {
            UI.showToast('Debes escribir "ELIMINAR" para confirmar', 'error');
            return;
        }
        
        try {
            await Sync.deleteAccount();
            await DB.clearAllData();
            
            App.usuario = null;
            App.empresaActual = null;
            
            UI.hideModal();
            UI.showLogin();
            UI.showToast('Cuenta eliminada exitosamente', 'success');
            
        } catch (error) {
            UI.showToast('Error al eliminar cuenta', 'error');
        }
    }
};