import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RefreshCw, UploadCloud, Users } from "lucide-react";
import type { AvatarSetLibrary } from "../domain/avatar-set";
import * as ui from "../../../shared/ui";

export function AvatarSetsPage({ locale }: { locale: "en" | "vi" }) {
  const copy = locale === "vi" ? {
    eyebrow: "Nội dung hồ sơ", title: "Bộ ảnh đại diện",
    description: "Xem trước các bộ ảnh cục bộ và đồng bộ ảnh JPEG tối ưu lên Firebase Storage.",
    choose: "Chọn thư mục", reload: "Tải lại", sync: "Đồng bộ lên đám mây",
    loading: "Đang tải bộ ảnh…", empty: "Không tìm thấy bộ ảnh.",
    male: "Nam", female: "Nữ", source: "Nguồn", syncDone: "Đồng bộ hoàn tất",
  } : {
    eyebrow: "Profile content", title: "Avatar sets",
    description: "Preview local avatar sets and sync optimized JPEG thumbnails to Firebase Storage.",
    choose: "Choose folder", reload: "Reload", sync: "Sync to cloud",
    loading: "Loading avatar sets…", empty: "No avatar sets found.",
    male: "Boys", female: "Girls", source: "Source", syncDone: "Sync complete",
  };
  const toast = ui.useToast();
  const [library, setLibrary] = useState<AvatarSetLibrary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (sourcePath?: string) => {
    setLoading(true); setError(null);
    try { setLibrary(await window.getgo.loadAvatarSets(sourcePath)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function chooseFolder() {
    const sourcePath = await window.getgo.chooseAvatarSetsFolder();
    if (sourcePath) await load(sourcePath);
  }

  async function sync() {
    if (!library) return;
    setSyncing(true); setError(null);
    try {
      const result = await window.getgo.syncAvatarSets(library.sourcePath);
      toast.show({
        title: copy.syncDone,
        description: `${result.avatarCount} avatars · ${result.setCount} sets · ${result.manifestPath}`,
      });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSyncing(false); }
  }

  return <section className="avatar-sets-page">
    <ui.PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actions={<ui.ControlGroup>
        <ui.Button icon={<FolderOpen />} onClick={() => void chooseFolder()}>{copy.choose}</ui.Button>
        <ui.Button icon={<RefreshCw />} disabled={!library} onClick={() => void load(library?.sourcePath)}>{copy.reload}</ui.Button>
        <ui.Button icon={<UploadCloud />} variant="solid" loading={syncing} disabled={!library} onClick={() => void sync()}>{copy.sync}</ui.Button>
      </ui.ControlGroup>}
    />
    {library && <div className="avatar-sets-source"><strong>{copy.source}</strong><code>{library.sourcePath}</code></div>}
    {error && <ui.ErrorFrame message={error} />}
    {loading ? <ui.PageLoading label={copy.loading} /> : !library?.sets.length ? <ui.Panel><ui.PanelBody>{copy.empty}</ui.PanelBody></ui.Panel> : (
      <div className="avatar-set-list">
        {library.sets.map(set => <ui.Panel
          key={set.id}
          title={set.name}
          description={`${set.avatars.length} avatars`}
          meta={<span className="avatar-set-count"><Users size={16} />{set.avatars.length}</span>}
        >
          <ui.PanelBody className="avatar-set-groups">
            {(["male", "female"] as const).map(gender => {
              const avatars = set.avatars.filter(avatar => avatar.gender === gender);
              if (!avatars.length) return null;
              return <section key={gender} className="avatar-set-group">
                <h3>{gender === "male" ? copy.male : copy.female}<span>{avatars.length}</span></h3>
                <div className="avatar-set-grid">
                  {avatars.map(avatar => <figure key={avatar.id} title={avatar.filename}>
                    <img src={avatar.previewDataUrl} alt={avatar.filename} />
                    <figcaption>{avatar.filename.replace(/\.[^.]+$/, "")}</figcaption>
                  </figure>)}
                </div>
              </section>;
            })}
          </ui.PanelBody>
        </ui.Panel>)}
      </div>
    )}
  </section>;
}
