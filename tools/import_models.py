"""Adds downloaded 3D anatomy models to the platform (served from this server only).

How to use
  1. On sketchfab.com (signed in) open each model, press "Download 3D model" and pick
     "glTF" (a .zip) or "GLB". Save the file into the folder  models_in/  named like this:

        ecorche.zip     Male Full Body Ecorche      (diegoluga)
        skeleton.zip    Skeleton                    (diegoluga)
        muscleM.zip     Male Body Muscular System   (ruslangadzhiev)
        muscleF.zip     Female Body Muscular System (ruslangadzhiev)
        skull.zip       Human skull and neck        (thesidekick)
        brain.zip       Human Brain                 (agher)
        heart.zip       Human Heart                 (Yasama)
        intestine.zip   Small and large intestine   (antonia.sundberg)
        kidney.zip      Kidney                      (cgmac)

     (.glb works too; send only the ones you have.)
  2. Run:   python tools/import_models.py
  3. Commit and deploy as usual. Each model is stored in static/models/ and listed in
     static/models/manifest.json together with the author credit (all are CC BY 4.0).
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "models_in"
DST = ROOT / "static" / "models"

META = {
    "ecorche": ("الجسم كاملًا (العضلات)", "Whole body (muscles)", "تەواوی جەستە (ماسولکە)", "diegoluga", "Male Full Body Ecorche",
                "جسم إنسان كامل مع الطبقة العضلية السطحية والعميقة بتفاصيل عالية.", "A complete human body with its superficial and deep muscle layers, in high detail."),
    "skeleton": ("الهيكل العظمي", "Skeleton", "ئێسکەپەیکەر", "diegoluga", "Skeleton",
                 "الهيكل العظمي الكامل: الجمجمة، العمود الفقري، القفص الصدري، الحوض والأطراف.", "The complete skeleton: skull, spine, rib cage, pelvis and limbs."),
    "muscleM": ("الجهاز العضلي (ذكر)", "Muscular system (male)", "سیستەمی ماسولکە (نێر)", "ruslangadzhiev", "Male Body Muscular System - Anatomy Study",
                "دراسة تشريحية لعضلات الجسم الذكري.", "An anatomical study of the male body's muscles."),
    "muscleF": ("الجهاز العضلي (أنثى)", "Muscular system (female)", "سیستەمی ماسولکە (مێ)", "ruslangadzhiev", "Female Body Muscular System - Anatomy Study",
                "دراسة تشريحية لعضلات الجسم الأنثوي.", "An anatomical study of the female body's muscles."),
    "skull": ("الجمجمة والرقبة", "Skull and neck", "کاسەی سەر و ملی", "thesidekick", "Human skull and neck",
              "الجمجمة والفك وفقرات الرقبة بدقة عالية جدًا.", "Skull, jaw and cervical vertebrae in very high detail."),
    "brain": ("الدماغ", "Brain", "مێشک", "agher", "Human Brain", "الدماغ البشري: التلافيف والفصوص والمخيخ.", "The human brain: gyri, lobes and cerebellum."),
    "heart": ("القلب", "Heart", "دڵ", "Yasama", "Human Heart", "القلب البشري مع الأوعية الكبرى.", "The human heart with its great vessels."),
    "intestine": ("الأمعاء الدقيقة والغليظة", "Small and large intestine", "ڕیخۆڵەی باریک و ئەستوور", "antonia.sundberg", "Small and large intestine",
                  "الجهاز الهضمي السفلي: الأمعاء الدقيقة والغليظة.", "The lower digestive tract: small and large intestine."),
    "kidney": ("الكلية", "Kidney", "گورچیلە", "cgmac", "Kidney", "الكلية وتركيبها الداخلي.", "The kidney and its internal structure."),
}


def main():
    SRC.mkdir(exist_ok=True)
    DST.mkdir(parents=True, exist_ok=True)
    manifest_path = DST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"models": []}
    have = {m["id"]: m for m in manifest["models"]}
    done = 0
    for mid, (ar, en, ku, author, title, d_ar, d_en) in META.items():
        files = [f for f in SRC.glob(mid + ".*") if f.suffix.lower() in (".zip", ".glb", ".gltf")]
        if not files:
            continue
        f = files[0]
        target = DST / mid
        if target.exists():
            shutil.rmtree(target)
        target.mkdir()
        if f.suffix.lower() == ".zip":
            with zipfile.ZipFile(f) as z:
                z.extractall(target)
            entry = next((p for p in target.rglob("*.gltf")), None) or next((p for p in target.rglob("*.glb")), None)
            if entry is None:
                print(f"! {f.name}: no .gltf/.glb inside — skipped")
                shutil.rmtree(target)
                continue
        else:
            shutil.copy(f, target / f.name)
            entry = target / f.name
        url = "/static/models/" + entry.relative_to(DST).as_posix()
        have[mid] = {"id": mid, "ar": ar, "en": en, "ku": ku, "author": author, "title": title, "license": "CC BY 4.0",
                     "d_ar": d_ar, "d_en": d_en, "url": url}
        size = sum(p.stat().st_size for p in target.rglob("*") if p.is_file()) / 1e6
        print(f"+ {mid}: {url}  ({size:.1f} MB)")
        done += 1
    order = list(META)
    manifest["models"] = sorted(have.values(), key=lambda m: order.index(m["id"]) if m["id"] in order else 99)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{done} model(s) added; {len(manifest['models'])} in total.")
    if not done:
        print("Nothing found in models_in/ — see the instructions at the top of this file.")


if __name__ == "__main__":
    sys.exit(main())
