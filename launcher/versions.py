"""Manifest officiel des versions + méta de chaque version (cache local)."""
import json
import os
import time

from . import paths
from .download import http_get_json

MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
MANIFEST_CACHE = os.path.join(paths.VERSIONS, "manifest.json")
MANIFEST_TTL = 3600  # 1 heure

_manifest = None


def get_manifest(force=False):
    """Manifest des versions, mis en cache localement pendant 1 h."""
    global _manifest
    if _manifest and not force:
        return _manifest
    if not force and os.path.exists(MANIFEST_CACHE):
        if time.time() - os.path.getmtime(MANIFEST_CACHE) < MANIFEST_TTL:
            try:
                with open(MANIFEST_CACHE, "r", encoding="utf-8") as f:
                    _manifest = json.load(f)
                return _manifest
            except Exception:
                pass
    data = http_get_json(MANIFEST_URL)
    os.makedirs(paths.VERSIONS, exist_ok=True)
    with open(MANIFEST_CACHE, "w", encoding="utf-8") as f:
        json.dump(data, f)
    _manifest = data
    return data


def refresh():
    return get_manifest(force=True)


def list_versions():
    m = get_manifest()
    out = []
    for v in m.get("versions", []):
        out.append({
            "id": v["id"],
            "type": v.get("type", "release"),
            "release_time": v.get("releaseTime", ""),
        })
    # Versions locales personnalisées (ex : profils Fabric installés) qui ne sont
    # pas dans le manifest officiel.
    vanilla_ids = {v["id"] for v in m.get("versions", [])}
    try:
        for name in sorted(os.listdir(paths.VERSIONS)):
            if not name.endswith(".json") or name == "manifest.json":
                continue
            vid = name[:-5]
            if vid in vanilla_ids:
                continue
            try:
                with open(os.path.join(paths.VERSIONS, name), "r", encoding="utf-8") as f:
                    meta = json.load(f)
                out.append({
                    "id": vid,
                    "type": meta.get("type", "custom"),
                    "release_time": meta.get("releaseTime", ""),
                    "custom": True,
                })
            except Exception:
                pass
    except Exception:
        pass
    return out


def latest():
    m = get_manifest()
    return m.get("latest", {})


# ---------------------------------------------------------------------------
# Statut d'installation, réparation, stats disque et nettoyage
# ---------------------------------------------------------------------------
def _dir_size(path):
    total = 0
    try:
        for root, _dirs, files in os.walk(path):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    except OSError:
        pass
    return total


def install_status(vid):
    """Indique si une version est installée et sa taille sur disque."""
    vdir = os.path.join(paths.VERSIONS, vid)
    client = os.path.join(vdir, "client.jar")
    installed = os.path.isfile(client)
    size = _dir_size(vdir) if installed else 0
    instance = os.path.join(paths.instances_root(), vid)
    world_size = _dir_size(os.path.join(instance, "saves")) if os.path.isdir(instance) else 0
    return {
        "installed": installed,
        "size": size,
        "instance_path": instance if os.path.isdir(instance) else None,
        "world_size": world_size,
    }


def repair_version(vid):
    """Réinitialise une version corrompue : supprime le client.jar et les
    natives pour forcer un re-téléchargement propre."""
    vdir = os.path.join(paths.VERSIONS, vid)
    for name in ("client.jar", "client_skinned.jar"):
        p = os.path.join(vdir, name)
        if os.path.isfile(p):
            try:
                os.remove(p)
            except OSError:
                pass
    natives_dir = os.path.join(paths.NATIVES, vid)
    if os.path.isdir(natives_dir):
        import shutil
        shutil.rmtree(natives_dir, ignore_errors=True)
    return True


def delete_version(vid):
    """Supprime une version installée (client, natives, libraries de la
    version). Les mondes dans le dossier d'installation sont conservés."""
    import shutil
    # Dossier de la version (client.jar + json)
    vdir = os.path.join(paths.VERSIONS, vid)
    if os.path.isdir(vdir):
        shutil.rmtree(vdir, ignore_errors=True)
    # json de version éventuellement à la racine de versions/
    meta = _version_cache_path(vid)
    if os.path.isfile(meta):
        try:
            os.remove(meta)
        except OSError:
            pass
    # Natives spécifiques à cette version
    natives_dir = os.path.join(paths.NATIVES, vid)
    if os.path.isdir(natives_dir):
        shutil.rmtree(natives_dir, ignore_errors=True)
    # On retire aussi le manifest si la version y figure (pour ne plus l'afficher
    # comme installée localement, les autres restent listées via le manifest officiel)
    return True


def disk_stats():
    """Espace utilisé par chaque dossier de données (en octets)."""
    return {
        "versions": _dir_size(paths.VERSIONS),
        "libraries": _dir_size(paths.LIBRARIES),
        "assets": _dir_size(paths.ASSETS),
        "java": _dir_size(paths.JAVA),
        "instances": _dir_size(paths.instances_root()),
        "logs": _dir_size(paths.LOGS),
        "natives": _dir_size(paths.NATIVES),
        "skins": _dir_size(paths.SKINS),
    }


def cleanup(max_logs=20, keep_instances=True):
    """Supprime les logs et natives obsolètes pour libérer de l'espace.
    Conserve les versions installées, les mondes et les skins."""
    import shutil
    freed = 0

    # Logs : on ne garde que les max_logs plus récents
    logs = []
    if os.path.isdir(paths.LOGS):
        logs = sorted(
            (os.path.join(paths.LOGS, f) for f in os.listdir(paths.LOGS) if f.endswith(".log")),
            key=os.path.getmtime, reverse=True,
        )
        for p in logs[max_logs:]:
            try:
                freed += os.path.getsize(p)
                os.remove(p)
            except OSError:
                pass

    # Natives orphelines (pas de version correspondante)
    installed_ids = set()
    if os.path.isdir(paths.VERSIONS):
        for f in os.listdir(paths.VERSIONS):
            if f.endswith(".json") and f != "manifest.json":
                installed_ids.add(f[:-5])
    if os.path.isdir(paths.NATIVES):
        for name in os.listdir(paths.NATIVES):
            if name not in installed_ids:
                p = os.path.join(paths.NATIVES, name)
                try:
                    freed += _dir_size(p)
                    shutil.rmtree(p, ignore_errors=True)
                except OSError:
                    pass

    return {"freed": freed, "logs_kept": min(len(logs), max_logs)}



def _version_cache_path(vid):
    return os.path.join(paths.VERSIONS, vid + ".json")


def get_version_meta(vid, _seen=None):
    """JSON complet d'une version (téléchargé puis mis en cache), avec résolution
    de l'héritage (champ inheritsFrom, ex : profils Fabric)."""
    cache = _version_cache_path(vid)
    raw = None
    if os.path.exists(cache):
        try:
            with open(cache, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except Exception:
            raw = None
    if raw is None:
        entry = None
        for v in get_manifest().get("versions", []):
            if v["id"] == vid:
                entry = v
                break
        if entry is None:
            raise KeyError("Version inconnue : " + vid)
        raw = http_get_json(entry["url"])
        os.makedirs(paths.VERSIONS, exist_ok=True)
        with open(cache, "w", encoding="utf-8") as f:
            json.dump(raw, f)
    return resolve_meta(raw, _seen=_seen or set())


def _maven_to_standard(lib):
    """Convertit une bibliothèque au format Maven Fabric (name + url) vers le
    format standard Mojang (downloads.artifact) attendu par le lanceur."""
    if "downloads" in lib:
        return lib
    name = lib.get("name", "")
    url = lib.get("url", "")
    parts = name.split(":")
    if len(parts) < 3 or not url:
        return lib
    group, artifact, version = parts[0], parts[1], parts[2]
    classifier = parts[3] if len(parts) > 3 else None
    filename = "%s-%s%s.jar" % (artifact, version, ("-" + classifier) if classifier else "")
    path = "%s/%s/%s/%s" % (group.replace(".", "/"), artifact, version, filename)
    return {
        "name": name,
        "downloads": {
            "artifact": {
                "url": url.rstrip("/") + "/" + path,
                "path": path,
                "sha1": lib.get("sha1"),
                "size": lib.get("size"),
            }
        },
    }


def resolve_meta(meta, _seen):
    """Fusionne une version avec son parent (inheritsFrom), récursivement."""
    parent = meta.get("inheritsFrom")
    if not parent:
        return meta
    vid = meta.get("id", parent)
    if vid in _seen:
        raise RuntimeError("Héritage de version circulaire : %s" % vid)
    parent_meta = get_version_meta(parent, _seen=_seen | {vid})
    return _merge(parent_meta, meta)


def _lib_key(lib):
    """Clé de déduplication des bibliothèques : group:artifact[:classifier].

    Deux bibliothèques avec la même clé (mais des versions différentes)
    sont en conflit sur le classpath — on ne garde que la version de
    l'enfant (Fabric), qui est généralement plus récente et requise.
    """
    name = lib.get("name", "")
    parts = name.split(":")
    if len(parts) >= 4:
        return parts[0] + ":" + parts[1] + ":" + parts[3]  # group:artifact:classifier
    return parts[0] + ":" + parts[1] if len(parts) >= 2 else name


def _merge(parent, child):
    merged = dict(parent)
    merged["id"] = child.get("id", parent.get("id"))
    # Champs scalaires : l'enfant écrase s'il les définit (mainClass, assets, etc.)
    for k in ("mainClass", "assets", "assetIndex", "javaVersion",
              "minecraftArguments", "type", "releaseTime", "downloads"):
        if k in child:
            merged[k] = child[k]
    # Bibliothèques : dédupliquées par group:artifact[:classifier].
    # L'enfant (Fabric) écrase le parent (vanilla) en cas de conflit —
    # sinon Fabric crash avec « duplicate ASM classes found on classpath ».
    parent_libs = [_maven_to_standard(l) for l in parent.get("libraries", [])]
    child_libs = [_maven_to_standard(l) for l in child.get("libraries", [])]
    seen = {}
    for lib in parent_libs:
        seen[_lib_key(lib)] = lib
    for lib in child_libs:
        seen[_lib_key(lib)] = lib  # L'enfant écrase le parent
    merged["libraries"] = list(seen.values())
    # Arguments : concaténation jvm + game
    pa = parent.get("arguments") or {}
    ca = child.get("arguments") or {}
    merged["arguments"] = {
        "jvm": list(pa.get("jvm", [])) + list(ca.get("jvm", [])),
        "game": list(pa.get("game", [])) + list(ca.get("game", [])),
    }
    return merged
