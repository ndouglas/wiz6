import { useState, useCallback, useRef, useEffect } from 'react';
import {
  readPresets, addPreset, deletePreset, copyCharactersToPcFile,
  removeCharacterFromPreset, loadStockFromAsset,
} from '../../lib/presets-store.js';
import { readRoster, writeRoster, removeCharacter } from '../../lib/roster-store.js';
import { charactersToJsonBlob, charactersToDbsBytes, parseImport } from '../../lib/pc-file-io.js';
import type { Character } from '@wiz6/data';
import styles from './PcFilePage.module.css';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PcFilePage() {
  const [presets, setPresets] = useState(() => readPresets());
  const [pcFile, setPcFile] = useState<Character[]>(() => readRoster().characters);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [namingPreset, setNamingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Character[] | null>(null);

  const refresh = useCallback(() => {
    setPresets(readPresets());
    setPcFile(readRoster().characters);
  }, []);

  // The Stock preset loads asynchronously from a served asset; if a cold
  // deep-link to /pc-file mounted before that fetch resolved, Stock would be
  // empty. Only then do we load it and re-read — when Stock is already
  // populated (the common case) this is a no-op, so no async state update.
  useEffect(() => {
    if (readPresets()[0]?.characters.length === 0) {
      void loadStockFromAsset().then(refresh);
    }
  }, [refresh]);

  const copy = useCallback(
    (chars: Character[]) => {
      const withIds = chars.map((c) => ({ ...c, id: crypto.randomUUID() }));
      const res = copyCharactersToPcFile(withIds);
      const msgs: string[] = [];
      if (res.added.length) msgs.push(`Added: ${res.added.join(', ')}`);
      if (res.skippedDuplicate.length) msgs.push(`Skipped (already in PC File): ${res.skippedDuplicate.join(', ')}`);
      if (res.skippedFull.length) msgs.push(`Skipped (PC File full): ${res.skippedFull.join(', ')}`);
      setNotice(msgs.length ? msgs.join(' · ') : null);
      refresh();
    },
    [refresh],
  );

  const saveAsPreset = useCallback(() => {
    addPreset(presetName.trim() || 'Untitled', pcFile);
    setNamingPreset(false);
    setPresetName('');
    refresh();
  }, [presetName, pcFile, refresh]);

  const onImportFile = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      setPendingImport(parseImport(file.name, bytes));
    } catch (e) {
      setNotice(`Import failed: ${(e as Error).message}`);
    }
  }, []);

  const addImportAsPreset = useCallback(() => {
    if (!pendingImport) return;
    addPreset('Imported', pendingImport);
    setPendingImport(null);
    refresh();
  }, [pendingImport, refresh]);

  const loadImportIntoPcFile = useCallback(() => {
    if (!pendingImport) return;
    if (pcFile.length && !confirm('Replace the current PC File?')) return;
    writeRoster({ schemaVersion: 1, characters: pendingImport.slice(0, 16) });
    setPendingImport(null);
    refresh();
  }, [pendingImport, pcFile, refresh]);

  const exportPcFileJson = useCallback(() => {
    download(charactersToJsonBlob(pcFile), 'pcfile.json');
  }, [pcFile]);

  const exportPcFileDbs = useCallback(() => {
    const bytes = charactersToDbsBytes(pcFile);
    // Ensure we have a plain ArrayBuffer (not SharedArrayBuffer) for Blob construction.
    const buf: ArrayBuffer = bytes.buffer instanceof ArrayBuffer ? bytes.buffer : new Uint8Array(bytes).buffer;
    download(new Blob([buf]), 'PCFILE.DBS');
  }, [pcFile]);

  return (
    <div className={styles.page}>
      <section className={styles.presets} aria-label="Presets">
        <h2>Presets</h2>
        <div className={styles.actions}>
          <button aria-label="Import" onClick={() => importInputRef.current?.click()}>
            Import .dbs / .json…
          </button>
        </div>
        {presets.map((p) => (
          <div key={p.id} className={styles.preset}>
            <h3>
              {p.name}
              {p.readOnly ? ' (read-only)' : ''}
              {' '}
              <button aria-label={`copy all from ${p.name}`} onClick={() => copy(p.characters)}>
                copy all →
              </button>
              <button
                aria-label={`export ${p.name} json`}
                onClick={() => download(charactersToJsonBlob(p.characters), `${p.name}.json`)}
              >
                Export (.json)
              </button>
              <button
                aria-label={`export ${p.name} dbs`}
                onClick={() => {
                  const bytes = charactersToDbsBytes(p.characters);
                  const buf: ArrayBuffer = bytes.buffer instanceof ArrayBuffer ? bytes.buffer : new Uint8Array(bytes).buffer;
                  download(new Blob([buf]), `${p.name}.DBS`);
                }}
              >
                Export (.dbs)
              </button>
              {!p.readOnly && (
                <button
                  aria-label={`delete ${p.name}`}
                  onClick={() => {
                    deletePreset(p.id);
                    refresh();
                  }}
                >
                  delete
                </button>
              )}
            </h3>
            <ul>
              {p.characters.map((c) => (
                <li key={c.id}>
                  {c.name}{' '}
                  <button aria-label={`copy ${c.name}`} onClick={() => copy([c])}>
                    copy →
                  </button>
                  {!p.readOnly && (
                    <button
                      aria-label={`delete ${c.name} from ${p.name}`}
                      onClick={() => {
                        removeCharacterFromPreset(p.id, c.id);
                        refresh();
                      }}
                    >
                      delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className={styles.pcfile} role="region" aria-label="PC File">
        <h2>PC File</h2>
        {notice && (
          <p className={styles.note} role="status">
            {notice}
          </p>
        )}
        {/* Hidden file input for import — triggered by the visible Import button in the Presets pane */}
        <input
          ref={importInputRef}
          type="file"
          aria-label="import file"
          accept=".json,.dbs"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onImportFile(file);
            // reset so re-selecting the same file triggers onChange again
            e.target.value = '';
          }}
        />
        {/* Import chooser — visible when a file has been parsed */}
        {pendingImport && (
          <div className={styles.importChooser} role="dialog" aria-label="Import chooser">
            <p>Imported {pendingImport.length} character(s). What would you like to do?</p>
            <button onClick={addImportAsPreset}>Add as preset</button>
            <button onClick={loadImportIntoPcFile}>Load into PC File</button>
            <button onClick={() => setPendingImport(null)}>Cancel</button>
          </div>
        )}
        <ul>
          {pcFile.map((c) => (
            <li key={c.id}>
              {c.name}{' '}
              <button
                aria-label={`export ${c.name} as json`}
                onClick={() => download(charactersToJsonBlob([c]), `${c.name}.json`)}
              >
                export (.json)
              </button>
              <button
                aria-label={`delete ${c.name} from pc file`}
                onClick={() => {
                  removeCharacter(c.id);
                  refresh();
                }}
              >
                delete
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.actions}>
          <button aria-label="Save as preset" onClick={() => setNamingPreset(true)}>
            Save as preset
          </button>
          <button aria-label="Export PC File as JSON" onClick={exportPcFileJson}>
            Export (.json)
          </button>
          <button aria-label="Export PC File as DBS" onClick={exportPcFileDbs}>
            Export (.dbs)
          </button>
        </div>
        {namingPreset && (
          <div>
            <label>
              Preset name{' '}
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                aria-label="Preset name"
              />
            </label>
            <button onClick={saveAsPreset}>Create</button>
            <button onClick={() => setNamingPreset(false)}>Cancel</button>
          </div>
        )}
        <p className={styles.note}>
          To add these to your party, use the castle&apos;s ADD PARTY MEMBER — it reads this PC
          File, exactly like the original game.
        </p>
      </section>
    </div>
  );
}
