import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://axpgwncduujxficolgyt.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4cGd3bmNkdXVqeGZpY29sZ3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MDU0NDgsImV4cCI6MjA4MTQ4MTQ0OH0.jCuEskTd5JJt7C_iS7_GzMwA7wOnGHQsT0tFzVLm9CE';

class SupabaseManager {
  constructor() {
    this.supabase = null;
    this.ready = false;
  }

  async init() {
    if (!navigator.onLine) {
      console.warn('⚠️ Sin conexión: Supabase no inicializado');
      return;
    }

    try {
      this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });

      await this.supabase.auth.getSession();
      this.ready = true;
      console.log('✅ Supabase listo');

    } catch (e) {
      console.error('❌ Error inicializando Supabase:', e.message);
    }
  }

  async login(email, password) {
    if (!this.ready) {
      throw new Error('Supabase aún no está listo');
    }

    if (!navigator.onLine) {
      throw new Error('Sin conexión a internet');
    }

    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return true;
  }

  async logout() {
    if (this.supabase) {
      await this.supabase.auth.signOut();
    }
  }
}

export const supabaseManager = new SupabaseManager();
