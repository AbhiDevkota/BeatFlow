import { useEffect, useState } from 'react';
import { Check, Globe, Loader2, Plus, Sparkles, Trash2, AlertCircle, Zap } from 'lucide-react';
import { isDesktopApp } from '@bitchord/shared/bridge';
import {
  addAddon,
  getAutoUpgradeQuality,
  getInstalledAddons,
  getPreferDolbyAtmos,
  removeAddon,
  setAutoUpgradeQuality,
  setPreferDolbyAtmos,
  syncAddonsWithFolderConfig,
  toggleAddon,
  type InstalledAddon,
} from '@/data/addons/addonStore';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

export function AddonsSettings() {
  const isDesktop = isDesktopApp();
  const [addons, setAddons] = useState<InstalledAddon[]>(() => getInstalledAddons());
  const [preferAtmos, setPreferAtmos] = useState<boolean>(() => getPreferDolbyAtmos());
  const [autoUpgrade, setAutoUpgrade] = useState<boolean>(() => getAutoUpgradeQuality());
  const [urlInput, setUrlInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void syncAddonsWithFolderConfig().then((synced) => {
      setAddons(synced);
    });
    const handleAtmos = (e: Event) => {
      const custom = e as CustomEvent<{ prefer: boolean }>;
      if (typeof custom.detail?.prefer === 'boolean') {
        setPreferAtmos(custom.detail.prefer);
      }
    };
    const handleAuto = (e: Event) => {
      const custom = e as CustomEvent<{ auto: boolean }>;
      if (typeof custom.detail?.auto === 'boolean') {
        setAutoUpgrade(custom.detail.auto);
      }
    };
    window.addEventListener('beatflow:prefer-atmos-changed', handleAtmos);
    window.addEventListener('beatflow:auto-upgrade-changed', handleAuto);
    return () => {
      window.removeEventListener('beatflow:prefer-atmos-changed', handleAtmos);
      window.removeEventListener('beatflow:auto-upgrade-changed', handleAuto);
    };
  }, []);

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
    <>
      <h2 className={settingsUi.sectionHeader}>Playback &amp; Hi-Res Audio</h2>
      <section className={settingsUi.group}>
        <Toggle
          icon={<Sparkles size={20} />}
          label="Prefer Dolby Atmos"
          detail="Ask hi-res sources for a Dolby Atmos copy when available. Falls back to stereo lossless when unsupported."
          checked={preferAtmos}
          onChange={(checked) => {
            setPreferAtmos(checked);
            setPreferDolbyAtmos(checked);
          }}
        />

        <Toggle
          icon={<Zap size={20} />}
          label="Automatic Hi-Res Upgrade"
          detail="Automatically upgrade songs to Lossless, Hi-Res, or Dolby Atmos from enabled addons during playback."
          checked={autoUpgrade}
          onChange={(checked) => {
            setAutoUpgrade(checked);
            setAutoUpgradeQuality(checked);
          }}
        />
      </section>

      <h2 className={settingsUi.sectionHeader}>Installed Addons</h2>
      <section className={settingsUi.group}>
        {addons.length === 0 ? (
          <div className="px-4 py-8 text-center text-secondary type-callout">
            No addons installed yet. Add a source URL below to stream and search from custom providers.
          </div>
        ) : (
          addons.map((addon) => (
            <div key={addon.id} className={settingsUi.rowWithIcon}>
              <span className={settingsUi.rowIcon}>
                <Globe size={20} className={addon.enabled ? 'text-key' : 'text-tertiary'} />
              </span>
              <div className={settingsUi.rowText}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${addon.enabled ? 'text-primary' : 'text-secondary line-through'}`}>
                    {addon.name}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-quaternary text-secondary font-mono">
                    v{addon.version}
                  </span>
                  {addon.resources.map((res) => (
                    <span
                      key={res}
                      className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-key/10 text-key border border-key/20"
                    >
                      {res}
                    </span>
                  ))}
                </div>
                <span className="type-caption text-secondary font-mono text-xs truncate max-w-sm mt-0.5" title={addon.baseUrl}>
                  {addon.baseUrl}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
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
                  className="p-1.5 rounded-full hover:bg-quaternary text-secondary hover:text-red transition-colors cursor-pointer"
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

      <h2 className={settingsUi.sectionHeader}>Add New Source</h2>
      <section className={settingsUi.group}>
        <form onSubmit={handleAdd} className="p-4 space-y-3">
          <label className="block type-caption text-secondary">
            Enter the base URL or manifest URL of the addon server:
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="url"
              placeholder="e.g. http://localhost:8080 or https://addon.example.com"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1 rounded-[10px] bg-quaternary/70 hover:bg-quaternary focus:bg-quaternary px-3.5 py-2 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:ring-1.5 focus:ring-key border border-divider transition-all"
              disabled={loading}
              required
            />
            <button
              type="submit"
              disabled={loading || !urlInput.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[10px] bg-key text-white text-sm font-medium hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none shadow-sm shrink-0 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Connecting…</span>
                </>
              ) : (
                <>
                  <Plus size={15} />
                  <span>Install Addon</span>
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red mt-2 bg-red/10 border border-red/20 px-3.5 py-2.5 rounded-[10px]">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-xs text-green mt-2 bg-green/10 border border-green/20 px-3.5 py-2.5 rounded-[10px]">
              <Check size={15} className="shrink-0" />
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
    </>
  );
}
