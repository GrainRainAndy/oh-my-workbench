"""Local macOS package inventory, retention and promotion."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "release"
APP = "Oh My Workbench.app"
NAME = re.compile(r"macos-(arm64|x64)-[A-Za-z0-9]{6}")
ZIP = "OhMyWorkbench-0.1.0-preview-arm64.zip"
NOW = lambda: dt.datetime.now(dt.timezone.utc).isoformat()


def output(*cmd):
    return subprocess.check_output(cmd, cwd=ROOT, text=True).strip()


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def write_json(path, data):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    os.replace(stream.name, path)


def package_dir(path):
    if not NAME.fullmatch(path.name) or path.is_symlink() or not path.is_dir():
        return False
    return all(not child.is_symlink() and (
        (child.name == APP and child.is_dir()) or
        (child.is_file() and (child.name in ("build.json","tests.log") or re.fullmatch(
            r"OhMyWorkbench-[\w.-]+-(?:arm64|x64)\.dmg", child.name))))
        for child in path.iterdir())


def inventory():
    running = output("ps", "-axo", "comm=")
    preview = (ROOT / "docs/preview-macos.md").read_text()
    evidence = (ROOT / "docs/qa/evidence/runtime-progress.md").read_text().splitlines()
    rows = []
    for path in STORE.iterdir():
        if not package_dir(path) and not (path.name == ZIP and path.is_file() and not path.is_symlink()):
            continue
        metadata = path / "build.json"
        stamp = (json.loads(metadata.read_text())["built_at"] if metadata.is_file() else
                 dt.datetime.fromtimestamp(path.stat().st_mtime, dt.timezone.utc).isoformat())
        rows.append(dict(name=path.name, date=stamp, date_source="manifest" if metadata.is_file() else "mtime",
                         complete=(path / APP).is_dir() or path.name == ZIP,
                         evidence=next((line[:220] for line in reversed(evidence) if path.name.split("-")[-1] in line), ""),
                         running=str(path)+"/" in running, linked="release/"+path.name+"/" in preview))
    rows.sort(key=lambda r:(r["date"],r["name"]), reverse=True)
    newest = {r["name"] for r in [r for r in rows if r["complete"]][:5]}
    for row in rows:
        row["decision"] = ("running" if row["running"] else "published link" if row["linked"] else
                           "recent" if row["name"] in newest else "remove")
    return rows


def rotate_checkpoints(apply):
    base = STORE / "checkpoints"
    if not base.exists():
        return
    entries = []
    for path in base.iterdir():
        if path.is_symlink() or not package_dir(path):
            continue
        meta = path / "build.json"
        if meta.is_file():
            record = json.loads(meta.read_text())
            if record.get("kind") == "checkpoint":
                entries.append((record["built_at"], path))
    for _, path in sorted(entries, reverse=True)[3:]:
        print("expire checkpoint", path.name)
        if apply:
            shutil.rmtree(path)


def rotate(apply, report):
    rows = inventory()
    if report:
        for r in rows:
            r["allocated_kib"] = int(output("du", "-sk", str(STORE / r["name"])).split()[0])
        write_json(report, dict(created_at=NOW(), kind="temporary", builds=rows))
    targets = [STORE / r["name"] for r in rows if r["decision"] == "remove"]
    print(f"Temporary inventory {len(rows)}, eligible {len(targets)}, retained {len(rows)-len(targets)}", flush=True)
    if apply:
        for path in targets:
            if path.name == ZIP:
                path.unlink()
            elif package_dir(path):
                shutil.rmtree(path)
    rotate_checkpoints(apply)


def record(path):
    if not package_dir(path) or not (path / APP).is_dir() or (path / "build.json").exists():
        raise ValueError("Expected a newly built package")
    write_json(path / "build.json", dict(kind="temporary", built_at=NOW(), commit=output("git","rev-parse","HEAD"),
               dirty=bool(output("git","status","--porcelain")), architecture=path.name.split("-")[1],
               checks=["codesign --verify --deep --strict"] + (["hdiutil verify"] if list(path.glob("*.dmg")) else []),
               images={p.name:digest(p) for p in path.glob("*.dmg")}))


def promote(path, milestone, summary):
    if not package_dir(path):
        raise ValueError("Unrecognized package")
    meta = json.loads((path / "build.json").read_text())
    if meta["dirty"] or meta["commit"] != output("git","rev-parse","HEAD") or output("git","status","--porcelain"):
        raise ValueError("Promotion requires the clean source commit recorded at build time")
    if not meta["images"]:
        raise ValueError("Build with --dmg before promotion")
    if milestone and (not re.fullmatch(r"v\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?", milestone) or
                      output("git","rev-parse",milestone+"^{commit}") != meta["commit"]):
        raise ValueError("Milestone requires a release tag at the source commit")
    base = STORE / ("milestones" if milestone else "checkpoints")
    base.mkdir(exist_ok=True)
    target = base / (milestone or path.name)
    if target.exists():
        raise ValueError("Archive already exists")
    for filename, expected in meta["images"].items():
        if digest(path / filename) != expected:
            raise ValueError("Image mismatch")
    with tempfile.TemporaryDirectory(dir=base) as stage:
        archive = Path(stage) / "archive"
        archive.mkdir()
        for filename in meta["images"]:
            shutil.copy2(path / filename, archive / filename)
            if digest(archive / filename) != meta["images"][filename]:
                raise ValueError("Archived image mismatch")
        tests = [["npm","test"],["npm","run","test:headless","--",str((path / APP).relative_to(ROOT))]]
        with (archive / "tests.log").open("w") as log:
            for cmd in tests:
                subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
        write_json(archive / "build.json",dict(meta,kind="milestone" if milestone else "checkpoint",
                   archived_at=NOW(), summary=summary, tests=[dict(command=c,exit_code=0) for c in tests]))
        archive.rename(target)
    rotate_checkpoints(True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action",choices=["plan","clean","record","checkpoint","milestone"])
    parser.add_argument("build",nargs="?")
    parser.add_argument("--tag")
    parser.add_argument("--summary")
    parser.add_argument("--report",type=Path)
    args = parser.parse_args()
    STORE.mkdir(exist_ok=True)
    with (STORE / ".retention.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        if args.action in ("plan","clean"):
            rotate(args.action=="clean",args.report)
        else:
            if not args.build or not NAME.fullmatch(args.build):
                parser.error("Pass the build directory name")
            path = STORE / args.build
            if args.action=="record":
                record(path)
            elif not args.summary or (args.action=="milestone" and not args.tag):
                parser.error("Provide --summary and a milestone --tag")
            else:
                promote(path,args.tag if args.action=="milestone" else None,args.summary)
