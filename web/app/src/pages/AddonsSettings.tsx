import { useState } from 'react';
import { Check, Globe, Loader2, Plus, Power, RefreshCw, Trash2, AlertCircle } from 'lucide-react';
import { MdOutlineExtension } from 'react-icons/md';
import { isDesktopApp } from '@bitchord/shared/bridge';
import {
  addAddon,
  getInstalledAddons,
  removeAddon,
  toggleAddon,
  type InstalledAddon,
} from '@/data/addons/addonStore';
import { settingsUi } from './settingsStyles';

export function AddonsSettings() {
  const isDesktop = isDesktopApp();
  const [addons, setAddons] = useState<InstalledAddon[]>(() => getInstalledAddons());
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refreshList = () => {
    setAddons(getInstalledAddons());
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const installed = await addAddon(urlInput.trim());
      setUrlInput('');
      setSuccess(`Added "${installed.name}" (v${installed.version})`);
      refreshList();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (id: string, currentState: boolean) => {
    toggleAddon(id, !currentState);
    refreshList();
  };

  const handleRemove = (id: string) => {
    removeAddon(id);
    refreshList();
  };

  if (!isDesktop) {
    return (
      <section className={settingsUi.group}>
        <div className={settingsUi.rowWithIcon}>
          <span className={settingsUi.rowIcon}>
            <AlertCircle size={20} className="text-secondary" />
          </span>
          <span className={settingsUi.rowText}>
            <span>Desktop Addons Only</span>
            <span className={settingsUi.rowDetail}>
              Custom music addons and direct HTTP sources are supported in the BeatFlow Desktop application.
            </span>
          </span>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className={settingsUi.group}>
        <div className="px-4 py-3 border-b border-quaternary/30 bg-quaternary/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MdOutlineExtension size={18} className="text-primary" />
            <span className="type-title-3 font-semibold text-primary">Installed Addons</span>
          </div>
          <span className="type-caption text-secondary">
            {addons.length} {addons.length === 1 ? 'source' : 'sources'}
          </span>
        </div>

        {addons.length === 0 ? (
          <div className="px-4 py-8 text-center text-secondary type-callout">
            No addons installed yet. Add a source URL below to stream and search from custom providers.
          </div>
        ) : (
          addons.map((addon) => (
            <div key={addon.id} className={settingsUi.rowWithIcon}>
              <span className={settingsUi.rowIcon}>
                <Globe size={18} className={addon.enabled ? 'text-primary' : 'text-tertiary'} />
              </span>
              <div className={settingsUi.rowText}>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${addon.enabled ? 'text-primary' : 'text-secondary line-through'}`}>
                    {addon.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-quaternary text-secondary font-mono">
                    v{addon.version}
                  </span>
                  {addon.resources.map((res) => (
                    <span
                      key={res}
                      className="text-[9px] uppercase tracking-wider px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20"
                    >
                      {res}
                    </span>
                  ))}
                </div>
                <span className="type-callout text-secondary font-mono text-xs truncate max-w-sm" title={addon.baseUrl}>
                  {addon.baseUrl}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className={settingsUi.switch}
                  checked={addon.enabled}
                  onChange={() => handleToggle(addon.id, addon.enabled)}
                  aria-label={`Toggle ${addon.name}`}
                />
                <button
                  type="button"
                  onClick={() => handleRemove(addon.id)}
                  className="p-1.5 rounded-full hover:bg-quaternary text-secondary hover:text-red transition-colors"
                  title="Remove Addon"
                  aria-label={`Remove ${addon.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <section className={settingsUi.group}>
        <div className="px-4 py-3 border-b border-quaternary/30 bg-quaternary/10 flex items-center gap-2">
          <Plus size={18} className="text-primary" />
          <span className="type-title-3 font-semibold text-primary">Add New Source</span>
        </div>

        <form onSubmit={handleAdd} className="p-4 space-y-3">
          <label className="block type-caption text-secondary">
            Enter the base URL or manifest URL of the addon server:
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="e.g. http://localhost:8080 or https://addon.example.com"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 rounded-[10px] bg-quaternary px-3 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-1 focus:ring-key border border-divider"
              disabled={loading}
              required
            />
            <button
              type="submit"
              disabled={loading || !urlInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-primary text-white text-sm font-medium hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Install Addon
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red mt-2 bg-red/10 border border-red/20 px-3 py-2 rounded-[8px]">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-xs text-green mt-2 bg-green/10 border border-green/20 px-3 py-2 rounded-[8px]">
              <Check size={14} className="flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}
        </form>
      </section>

      <p className={settingsUi.footer}>
        Addons are ordinary HTTP servers implementing the BeatFlow protocol (/manifest.json, /search, and /stream).
        No foreign code is ever downloaded or executed. When enabled, your custom addons are searched first, with
        YouTube Music serving as a comprehensive fallback.
      </p>
    </div>
  );
}
