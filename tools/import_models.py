"""Adds downloaded 3D anatomy models to the platform (served from this server only).

Put the files you downloaded from Sketchfab (glTF .zip or .glb) in the folder  models_in/
-- any file whose name is listed in FILES below is picked up -- then run:

    venv\\Scripts\\python.exe tools\\import_models.py

Each model is unpacked into static/models/<id>/, its big textures are shrunk (max 1024 px, JPEG)
so it opens quickly on a phone, and it is listed in static/models/manifest.json with the
author credit (the licence of every one of them is CC BY 4.0: credit the author, which the
page does as plain text under the model).
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "models_in"
DST = ROOT / "static" / "models"
MAX_TEX = 1024

# id: (file name without extension, ar, en, ku, author, title, description ar, description en)
M = [
    ("ecorche", "male_full_body_ecorche", "الجسم كاملًا (العضلات)", "Whole body (muscles)", "تەواوی جەستە (ماسولکە)", "diegoluga", "Male Full Body Ecorche",
     "جسم إنسان كامل مع الطبقة العضلية السطحية والعميقة بتفاصيل عالية.", "A complete human body with its superficial and deep muscle layers, in high detail."),
    ("skeleton", "skeleton", "الهيكل العظمي", "Skeleton", "ئێسکەپەیکەر", "diegoluga", "Skeleton",
     "الهيكل العظمي الكامل: الجمجمة، العمود الفقري، القفص الصدري، الحوض والأطراف.", "The complete skeleton: skull, spine, rib cage, pelvis and limbs."),
    ("muscleM", "male_body_muscular_system_-_anatomy_study", "الجهاز العضلي (ذكر)", "Muscular system (male)", "سیستەمی ماسولکە (نێر)", "ruslangadzhiev",
     "Male Body Muscular System - Anatomy Study", "دراسة تشريحية لعضلات الجسم الذكري.", "An anatomical study of the male body's muscles."),
    ("muscleF", "female_body_muscular_system_-_anatomy_study", "الجهاز العضلي (أنثى)", "Muscular system (female)", "سیستەمی ماسولکە (مێ)", "ruslangadzhiev",
     "Female Body Muscular System - Anatomy Study", "دراسة تشريحية لعضلات الجسم الأنثوي.", "An anatomical study of the female body's muscles."),
    ("spine", "the_human_spinal_column", "العمود الفقري", "Spinal column", "ستوونی پشت", "scratchi", "The human spinal column",
     "العمود الفقري بفقراته: العنقية والصدرية والقطنية والعجز.", "The vertebral column: cervical, thoracic, lumbar vertebrae and the sacrum."),
    ("skull", "human_skull_and_neck", "الجمجمة والرقبة", "Skull and neck", "کاسەی سەر و ملی", "thesidekick", "Human skull and neck",
     "الجمجمة والفك وفقرات الرقبة بدقة عالية جدًا.", "Skull, jaw and cervical vertebrae in very high detail."),
    ("brain", "human_brain", "الدماغ", "Brain", "مێشک", "agher", "Human Brain", "الدماغ البشري: التلافيف والفصوص والمخيخ.", "The human brain: gyri, lobes and cerebellum."),
    ("eye", "my_model_of_eye", "العين", "Eye", "چاو", "evgenartist", "My model of eye", "العين وتركيبها الداخلي.", "The eye and its internal structure."),
    ("mouth", "human_mouth_detailed", "الفم والأسنان واللسان", "Mouth, teeth and tongue", "دەم و ددان و زمان", "Mince", "Human mouth detailed",
     "الفم بالأسنان واللسان واللثة.", "The mouth with its teeth, tongue and gums."),
    ("heart", "human_heart", "القلب", "Heart", "دڵ", "Yasama", "Human Heart", "القلب البشري مع الأوعية الكبرى.", "The human heart with its great vessels."),
    ("lungs", "realistic_human_lungs", "الرئتان", "Lungs", "سییەکان", "neshallads", "Realistic Human Lungs", "الرئتان وفصوصهما.", "The lungs and their lobes."),
    ("trachea", "tracheobronchial_tree", "القصبة الهوائية والشعب", "Tracheobronchial tree", "بۆڕی هەناسە و لقەکانی", "CVEC", "Tracheobronchial tree",
     "القصبة الهوائية والشعب الهوائية.", "The trachea and the bronchial tree."),
    ("diaphragm", "human_diaphragm", "الحجاب الحاجز", "Diaphragm", "پەردەی سک", "Devden", "Human Diaphragm", "الحجاب الحاجز وفتحاته.", "The diaphragm and its openings."),
    ("digestive", "digestive_system", "الجهاز الهضمي", "Digestive system", "سیستەمی هەرس", "7D_Production", "digestive system",
     "الجهاز الهضمي من الفم إلى الشرج.", "The digestive system from mouth to anus."),
    ("stomach", "stomach", "المعدة", "Stomach", "گەدە", "vikrama1998", "Stomach", "المعدة وتركيبها.", "The stomach and its structure."),
    ("liver", "human_liver_and_gallbladder", "الكبد والمرارة", "Liver and gallbladder", "جگەر و زراو", "ElliotSS", "Human liver and gallbladder",
     "الكبد والمرارة والقنوات الصفراوية.", "The liver, gallbladder and bile ducts."),
    ("pancreas", "human_pancreas_cross_section", "البنكرياس (مقطع)", "Pancreas (cross-section)", "پەنکریاس (بڕین)", "arloopa", "Human Pancreas Cross section",
     "البنكرياس بمقطع يُظهر تركيبه الداخلي.", "The pancreas in cross-section."),
    ("spleen", "duodenum_pancreas_spleen", "الاثنا عشر والبنكرياس والطحال", "Duodenum, pancreas and spleen", "دوازدە ئەنگوستە و پەنکریاس و سپڵ", "580000158",
     "Duodenum, Pancreas, Spleen", "الاثنا عشر والبنكرياس والطحال معًا.", "The duodenum, pancreas and spleen together."),
    ("intestine", "small_and_large_intestine", "الأمعاء الدقيقة والغليظة", "Small and large intestine", "ڕیخۆڵەی باریک و ئەستوور", "antonia.sundberg",
     "Small and large intestine", "الجهاز الهضمي السفلي: الأمعاء الدقيقة والغليظة.", "The lower digestive tract: small and large intestine."),
    ("kidney", "kidney", "الكلية", "Kidney", "گورچیلە", "cgmac", "Kidney", "الكلية وتركيبها الداخلي.", "The kidney and its internal structure."),
    ("femalerepro", "female_reproductive_organs-x_section", "الجهاز التناسلي الأنثوي (مقطع)", "Female reproductive organs (section)", "ئەندامی زاوزێی مێ (بڕین)", "cvallance01",
     "Female Reproductive Organs-X Section", "الرحم والمبيضان والأنبوبان بمقطع.", "The uterus, ovaries and tubes in section."),
    ("hand", "human_right_hand", "اليد اليمنى", "Right hand", "دەستی ڕاست", "ramon.gonzalez.cab", "HUMAN RIGHT HAND.", "اليد اليمنى بعظامها وعضلاتها.", "The right hand with its bones and muscles."),
    ("shoulder", "shoulder_joint", "مفصل الكتف", "Shoulder joint", "جومگەی شان", "arloopa", "Shoulder joint", "مفصل الكتف.", "The shoulder joint."),
    ("knee", "knee_anatomy", "مفصل الركبة", "Knee joint", "جومگەی ئەژنۆ", "arloopa", "Knee Anatomy", "مفصل الركبة وأربطته.", "The knee joint and its ligaments."),
]


def shrink_textures(folder: Path):
    """Shrinks every image and fixes the references inside the .gltf. Returns bytes saved."""
    saved = 0
    gltfs = list(folder.rglob("*.gltf"))
    for g in gltfs:
        data = json.loads(g.read_text(encoding="utf-8"))
        changed = False
        for img in data.get("images", []):
            uri = img.get("uri")
            if not uri or uri.startswith("data:"):
                continue
            p = (g.parent / uri)
            if not p.exists():
                continue
            before = p.stat().st_size
            try:
                im = Image.open(p)
                im.load()
            except Exception:
                continue
            if max(im.size) > MAX_TEX:
                im.thumbnail((MAX_TEX, MAX_TEX), Image.LANCZOS)
            has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            if has_alpha:
                out = p.with_suffix(".png")
                im.convert("RGBA").save(out, optimize=True)
            else:
                out = p.with_suffix(".jpg")
                im.convert("RGB").save(out, "JPEG", quality=82, optimize=True)
            if out != p:
                p.unlink()
                img["uri"] = (Path(uri).with_suffix(out.suffix)).as_posix()
                img["mimeType"] = "image/png" if out.suffix == ".png" else "image/jpeg"
                changed = True
            saved += before - out.stat().st_size
        if changed:
            g.write_text(json.dumps(data), encoding="utf-8")
    return saved


def main():
    SRC.mkdir(exist_ok=True)
    DST.mkdir(parents=True, exist_ok=True)
    manifest_path = DST / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"models": []}
    have = {m["id"]: m for m in manifest["models"]}
    done = 0
    for mid, stem, ar, en, ku, author, title, d_ar, d_en in M:
        files = [f for f in SRC.glob(stem + ".*") if f.suffix.lower() in (".zip", ".glb", ".gltf")] or \
                [f for f in SRC.glob(mid + ".*") if f.suffix.lower() in (".zip", ".glb", ".gltf")]
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
            entry = next(iter(target.rglob("*.gltf")), None) or next(iter(target.rglob("*.glb")), None)
            if entry is None:
                print(f"! {f.name}: no .gltf/.glb inside - skipped")
                shutil.rmtree(target)
                continue
        else:
            shutil.copy(f, target / f.name)
            entry = target / f.name
        saved = shrink_textures(target)
        # a very heavy mesh (millions of triangles) is simplified so it opens on a phone
        g = next(iter(target.rglob("*.gltf")), None)
        if g is not None and sum(b.stat().st_size for b in g.parent.glob("*.bin")) > 40e6:
            sys.path.insert(0, str(Path(__file__).parent))
            import decimate_gltf
            decimate_gltf.main(str(g), 260)
        size = sum(p.stat().st_size for p in target.rglob("*") if p.is_file()) / 1e6
        have[mid] = {"id": mid, "ar": ar, "en": en, "ku": ku, "author": author, "title": title, "license": "CC BY 4.0",
                     "d_ar": d_ar, "d_en": d_en, "url": "/static/models/" + entry.relative_to(DST).as_posix(), "mb": round(size, 1)}
        print(f"+ {mid:12} {size:6.1f} MB  (textures -{saved / 1e6:.1f} MB)")
        done += 1
    order = [m[0] for m in M]
    manifest["models"] = sorted(have.values(), key=lambda m: order.index(m["id"]) if m["id"] in order else 99)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(m.get("mb", 0) for m in manifest["models"])
    print(f"{done} model(s) processed; {len(manifest['models'])} listed, about {total:.0f} MB in total.")


if __name__ == "__main__":
    sys.exit(main())
