"""Writes static/models/parts.json: what to show when a student taps a part of a model.

Two kinds of entries per model:
  "by":      rules matched against the tapped mesh's own names (node / mesh / material).
            Used only where the model's author named the pieces (liver, kidney, brain...).
  "regions": for whole-body / skull / spine models whose pieces are not named. The tap
            position (relative to the model's bounding box) picks the region. These labels are
            approximate by nature, and the page says so.
Everything not covered falls back to the model's own name and description.
Run:  python tools/build_parts.py
"""
import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "models" / "parts.json"


def P(m, ar, en, d_ar, d_en):
    return {"m": m, "ar": ar, "en": en, "d_ar": d_ar, "d_en": d_en}


BY = {
    "brain": [
        P("cerebellum", "المخيخ", "Cerebellum",
          "يقع خلف جذع الدماغ وتحت المخ. ينسّق الحركات الإرادية والتوازن ووضعية الجسم ويضبط دقة الحركة.",
          "Lies behind the brainstem under the cerebrum. It coordinates voluntary movement, balance and posture and fine-tunes the precision of movement."),
        P("brain_stem|stem", "جذع الدماغ", "Brainstem",
          "يصل المخ بالنخاع الشوكي، ويتكوّن من الدماغ المتوسط والجسر والنخاع المستطيل. فيه مراكز التنفس ونبض القلب والوعي، وتخرج منه معظم الأعصاب القحفية.",
          "Connects the cerebrum to the spinal cord (midbrain, pons, medulla). It holds the centres for breathing, heart rate and consciousness, and most cranial nerves leave from it."),
        P("brain", "المخ", "Cerebrum",
          "أكبر أجزاء الدماغ، مقسوم إلى نصفين كرويين يغطيهما القشرة المخية ذات التلافيف. مسؤول عن التفكير والذاكرة والإحساس والحركة الإرادية والكلام.",
          "The largest part of the brain, split into two hemispheres covered by the folded cerebral cortex. It handles thinking, memory, sensation, voluntary movement and speech."),
    ],
    "eye": [
        P("sclera", "الصلبة", "Sclera",
          "الغلاف الأبيض القاسي الذي يشكّل معظم جدار مقلة العين ويحميها ويحافظ على شكلها، وتتصل به عضلات حركة العين.",
          "The tough white outer layer that forms most of the eyeball wall, protecting it and keeping its shape; the eye muscles attach to it."),
        P("iris", "القزحية", "Iris",
          "القرص الملوّن حول البؤبؤ. عضلاتها تضيّق البؤبؤ في الضوء القوي وتوسّعه في الضوء الخافت لتنظيم كمية الضوء الداخلة.",
          "The coloured disc around the pupil. Its muscles narrow the pupil in bright light and widen it in dim light to control how much light enters."),
        P("eye", "مقلة العين", "Eyeball",
          "الكرة الحساسة للضوء. يمر الضوء عبر القرنية والعدسة ليتجمع على الشبكية التي تحوّله إلى إشارات عصبية يحملها العصب البصري إلى الدماغ.",
          "The light-sensing globe. Light passes through the cornea and lens and focuses on the retina, which turns it into nerve signals carried to the brain by the optic nerve."),
    ],
    "liver": [
        P("inferior vena cava", "الوريد الأجوف السفلي", "Inferior vena cava",
          "أكبر وريد في الجسم؛ يجمع الدم من النصف السفلي من الجسم ويعيده إلى الأذين الأيمن للقلب، ويمر بجانب الكبد.",
          "The body's largest vein; it collects blood from the lower half of the body and returns it to the right atrium, passing beside the liver."),
        P("gallbladder", "المرارة", "Gallbladder",
          "كيس صغير تحت الكبد يخزّن العصارة الصفراوية ويركّزها، ويفرغها في الاثني عشر عند تناول الدهون للمساعدة على هضمها.",
          "A small sac under the liver that stores and concentrates bile and releases it into the duodenum after fatty meals to help digest fat."),
        P("hepatic artery", "الشريان الكبدي", "Hepatic artery",
          "يغذّي الكبد بالدم المؤكسج (حوالي ربع تدفقه) ويتفرع من الشريان البطني (الجذع الزلاقي).",
          "Supplies the liver with oxygenated blood (about a quarter of its flow); it arises from the coeliac trunk."),
        P("portal vein", "الوريد البابي", "Portal vein",
          "يحمل الدم الغني بالمواد الغذائية من الأمعاء والطحال والمعدة إلى الكبد ليعالجها، وهو المصدر الأكبر لدم الكبد.",
          "Carries nutrient-rich blood from the intestines, spleen and stomach to the liver for processing; it is the liver's main blood supply."),
        P("liver", "الكبد", "Liver",
          "أكبر غدة في الجسم. يصنع العصارة الصفراوية والبروتينات ومواد التخثّر، ويخزّن الجلايكوجين، ويعالج الأدوية والسموم والمواد الغذائية القادمة من الأمعاء.",
          "The body's largest gland. It makes bile, proteins and clotting factors, stores glycogen, and processes drugs, toxins and nutrients arriving from the gut."),
    ],
    "kidney": [
        P("medulla", "الأهرامات النخاعية", "Medullary pyramids",
          "أجزاء مخروطية في لب الكلية تحتوي على أنابيب جمع البول. تصب قممها (الحليمات) في الكؤوس الكلوية.",
          "Cone-shaped parts of the kidney's inner zone containing the collecting tubules; their tips (papillae) drain into the minor calyces."),
        P("ureter", "الحالب", "Ureter",
          "أنبوب عضلي ينقل البول من حوض الكلية إلى المثانة بحركة تمعجية.",
          "A muscular tube that carries urine from the renal pelvis to the bladder by peristalsis."),
        P("cortex", "القشرة الكلوية", "Renal cortex",
          "الطبقة الخارجية للكلية، فيها كبيبات الترشيح (النيفرونات) حيث يُرشَّح الدم لتكوين البول.",
          "The outer layer of the kidney containing the glomeruli (nephrons) where blood is filtered to form urine."),
        P("capsule", "المحفظة الكلوية", "Renal capsule",
          "غلاف ليفي رقيق يحيط بالكلية ويحميها ويحافظ على شكلها.",
          "A thin fibrous covering that wraps the kidney, protecting it and keeping its shape."),
        P("red", "الشريان الكلوي", "Renal artery",
          "يحمل الدم المؤكسج من الأبهر إلى الكلية للترشيح (يُرسم عادة باللون الأحمر).",
          "Brings oxygenated blood from the aorta to the kidney for filtering (conventionally drawn in red)."),
        P("blue", "الوريد الكلوي", "Renal vein",
          "يعيد الدم المرشَّح من الكلية إلى الوريد الأجوف السفلي (يُرسم عادة باللون الأزرق).",
          "Returns filtered blood from the kidney to the inferior vena cava (conventionally drawn in blue)."),
    ],
    "shoulder": [
        P("bone", "عظام مفصل الكتف", "Shoulder bones",
          "الترقوة ولوح الكتف وعظم العضد. يتمفصل رأس العضد مع الحُق (التجويف الحقاني) في لوح الكتف مكوّنًا مفصلًا كرويًا واسع الحركة.",
          "The clavicle, scapula and humerus. The humeral head sits in the glenoid cavity of the scapula forming a wide-ranging ball-and-socket joint."),
        P("muscul", "عضلات الكتف", "Shoulder muscles",
          "تشمل العضلة الدالية وعضلات الكفة المدوّرة (فوق الشوكة وتحت الشوكة والمدورة الصغيرة وتحت الكتف) التي تثبّت المفصل وتحرّكه.",
          "Includes the deltoid and the rotator-cuff muscles (supraspinatus, infraspinatus, teres minor, subscapularis) that stabilise and move the joint."),
    ],
    "intestine": [
        P("tjocktarm", "الأمعاء الغليظة (القولون)", "Large intestine (colon)",
          "تمتصّ الماء والأملاح من بقايا الطعام وتكوّن البراز. تضم الأعور والقولون الصاعد والمستعرض والنازل والسيني ثم المستقيم.",
          "Absorbs water and salts from leftovers and forms stool: caecum, ascending, transverse, descending and sigmoid colon, then the rectum."),
        P("tunntarm", "الأمعاء الدقيقة", "Small intestine",
          "أطول أجزاء القناة الهضمية (حوالي 6 أمتار): اثنا عشر وصائم ولفائفي. فيها يتم معظم الهضم وامتصاص المواد الغذائية عبر الزغابات المعوية.",
          "The longest part of the digestive tract (about 6 m): duodenum, jejunum, ileum. Most digestion and nutrient absorption happens here through the villi."),
    ],
    "femalerepro": [
        P("ovary", "المبيض", "Ovary",
          "غدة بحجم اللوزة تنتج البويضات وهرمونات الإستروجين والبروجسترون. يقع على جانبي الرحم قرب نهاية قناة فالوب.",
          "An almond-sized gland that produces eggs and the hormones oestrogen and progesterone, lying beside the uterus near the end of the fallopian tube."),
        P("uterus", "الرحم", "Uterus",
          "عضو عضلي مجوّف على شكل كمّثرى، تنغرس فيه البويضة المخصّبة وينمو الجنين. جدره من ثلاث طبقات: البطانة والعضلية والمحيطية.",
          "A hollow pear-shaped muscular organ where the fertilised egg implants and the foetus grows. Its wall has three layers: endometrium, myometrium and perimetrium."),
    ],
    "knee": [
        P("bone", "عظام الركبة", "Knee bones",
          "عظم الفخذ في الأعلى وقصبة الساق (الظنبوب) في الأسفل والرضفة أمامهما، وهي تشكل مفصل الركبة وهو أكبر مفاصل الجسم.",
          "The femur above, the tibia below and the patella in front: together they form the knee, the body's largest joint."),
    ],
    "mouth": [
        P("teeth", "الأسنان", "Teeth",
          "عند البالغ 32 سنًا: قواطع وأنياب وضواحك وأرحاء. تقطع الطعام وتمضغه، وتتكون من مينا وعاج ولبّ وجذر مثبّت في عظم الفك.",
          "An adult has 32 teeth: incisors, canines, premolars and molars. They cut and grind food and consist of enamel, dentine, pulp and a root set in the jaw bone."),
    ],
}

# ---- region rules for models whose pieces are not named
# each region: [name_ar, name_en, description_ar, description_en, test]; the tests are written in the viewer as
# simple conditions on ny (0 = bottom, 1 = top), ax (distance from the centre line, 0..1) and nz (0 = back, 1 = front)
BODY_REGIONS = [
    {"id": "head", "ny": [0.87, 1.0], "ax": [0, 1],
     "ar": "الرأس", "en": "Head",
     "d_ar": {"skeleton": "الجمجمة: تحمي الدماغ وتشكّل هيكل الوجه، وتضم الفك السفلي المتحرك الوحيد في الرأس.",
              "muscle": "عضلات الوجه والمضغ: تعبيرات الوجه والمضغ (العضلة الماضغة والصدغية) وحركة العين والشفتين.",
              "body": "الرأس يضم الدماغ وأعضاء الحواس (العين والأذن والأنف واللسان) وبداية الجهازين التنفسي والهضمي."},
     "d_en": {"skeleton": "The skull: protects the brain and forms the face; the mandible is its only movable bone.",
              "muscle": "Facial and chewing muscles: facial expression, chewing (masseter, temporalis) and movement of the eyes and lips.",
              "body": "The head holds the brain, the sense organs (eye, ear, nose, tongue) and the start of the respiratory and digestive tracts."}},
    {"id": "neck", "ny": [0.82, 0.87], "ax": [0, 0.22],
     "ar": "الرقبة", "en": "Neck",
     "d_ar": {"skeleton": "سبع فقرات رقبية تدعم الرأس وتتيح حركته، وتحمي النخاع الشوكي.",
              "muscle": "عضلات الرقبة (القترائية الترقوية الخشائية وشبه المنحرفة) تحرّك الرأس وتثبّته.",
              "body": "تمرّ فيها القصبة الهوائية والمريء والأوعية الكبيرة (السباتية والوداجية) والغدة الدرقية."},
     "d_en": {"skeleton": "Seven cervical vertebrae support and move the head and protect the spinal cord.",
              "muscle": "Neck muscles (sternocleidomastoid, trapezius) move and steady the head.",
              "body": "Carries the trachea, oesophagus, the great vessels (carotid and jugular) and the thyroid gland."}},
    {"id": "thorax", "ny": [0.62, 0.82], "ax": [0, 0.2],
     "ar": "الصدر", "en": "Chest (thorax)",
     "d_ar": {"skeleton": "القفص الصدري: القص و12 زوجًا من الأضلاع مع الفقرات الصدرية، يحمي القلب والرئتين ويساعد على التنفس.",
              "muscle": "عضلات الصدر (الصدرية الكبرى والمنشارية والوربية) تحرّك الذراع وتساعد على التنفس.",
              "body": "يحتوي القلب والرئتين والمريء والأوعية الكبيرة، ويفصله الحجاب الحاجز عن البطن."},
     "d_en": {"skeleton": "The rib cage: sternum and 12 pairs of ribs with the thoracic vertebrae; it protects the heart and lungs and aids breathing.",
              "muscle": "Chest muscles (pectoralis major, serratus, intercostals) move the arm and help breathing.",
              "body": "Holds the heart, lungs, oesophagus and great vessels, separated from the abdomen by the diaphragm."}},
    {"id": "arm", "ny": [0.58, 0.84], "ax": [0.2, 1],
     "ar": "الكتف والذراع", "en": "Shoulder and upper arm",
     "d_ar": {"skeleton": "لوح الكتف والترقوة وعظم العضد، تتمفصل في مفصل الكتف الواسع الحركة.",
              "muscle": "العضلة الدالية تغطي الكتف، والعضلة ذات الرأسين تثني المرفق، وذات الثلاثة رؤوس تبسطه.",
              "body": "الطرف العلوي: يتصل بالجذع عبر الكتف ويحمل الأعصاب والأوعية إلى الساعد واليد."},
     "d_en": {"skeleton": "Scapula, clavicle and humerus meeting at the highly mobile shoulder joint.",
              "muscle": "The deltoid covers the shoulder, the biceps bends the elbow and the triceps straightens it.",
              "body": "The upper limb joins the trunk at the shoulder and carries nerves and vessels to the forearm and hand."}},
    {"id": "forearm", "ny": [0.46, 0.58], "ax": [0.2, 1],
     "ar": "الساعد", "en": "Forearm",
     "d_ar": {"skeleton": "عظمان متوازيان: الكعبرة (جهة الإبهام) والزند (جهة الخنصر)، وبينهما الغشاء بين العظمين.",
              "muscle": "عضلات القابضة في الأمام والباسطة في الخلف تحرّك الرسغ والأصابع.",
              "body": "تمرّ فيه أعصاب الساعد (المتوسط والزندي والكعبري) وأوعيته."},
     "d_en": {"skeleton": "Two parallel bones: the radius (thumb side) and the ulna (little-finger side), joined by the interosseous membrane.",
              "muscle": "Flexors at the front and extensors at the back move the wrist and fingers.",
              "body": "Carries the median, ulnar and radial nerves and the forearm vessels."}},
    {"id": "hand", "ny": [0.36, 0.46], "ax": [0.2, 1],
     "ar": "اليد", "en": "Hand",
     "d_ar": {"skeleton": "8 عظام رسغية و5 مشطيات و14 سلاميات للأصابع.",
              "muscle": "عضلات صغيرة في راحة اليد (عضلات الإبهام والخنصر والديدانية) تعطي اليد دقتها.",
              "body": "الجزء الأكثر دقة في الحركة والإحساس بفضل كثرة النهايات العصبية."},
     "d_en": {"skeleton": "8 carpal bones, 5 metacarpals and 14 phalanges.",
              "muscle": "Small palm muscles (thenar, hypothenar, lumbricals) give the hand its precision.",
              "body": "The most finely moving and sensitive part thanks to its dense nerve endings."}},
    {"id": "abdomen", "ny": [0.5, 0.62], "ax": [0, 0.2],
     "ar": "البطن", "en": "Abdomen",
     "d_ar": {"skeleton": "العمود الفقري القطني (5 فقرات) في الخلف؛ ولا توجد أضلاع في الأمام لذلك تحميه العضلات.",
              "muscle": "عضلات جدار البطن (المستقيمة والمائلة والمستعرضة) تحمي الأحشاء وتثني الجذع وتضغط على البطن.",
              "body": "فيه المعدة والكبد والأمعاء والبنكرياس والطحال والكليتان."},
     "d_en": {"skeleton": "The five lumbar vertebrae at the back; there are no ribs in front, so muscles protect it.",
              "muscle": "Abdominal wall muscles (rectus, obliques, transversus) protect the organs, flex the trunk and raise abdominal pressure.",
              "body": "Contains the stomach, liver, intestines, pancreas, spleen and kidneys."}},
    {"id": "pelvis", "ny": [0.4, 0.5], "ax": [0, 0.25],
     "ar": "الحوض", "en": "Pelvis",
     "d_ar": {"skeleton": "الحوض: عظما الورك مع العجز والعصعص، يحملان وزن الجذع ويحميان أعضاء الحوض.",
              "muscle": "عضلات الألية (الكبرى والوسطى والصغرى) تبسط الورك وتثبّت الحوض أثناء المشي.",
              "body": "يحتوي المثانة والمستقيم وأعضاء التناسل الداخلية."},
     "d_en": {"skeleton": "The pelvis: two hip bones with the sacrum and coccyx; it carries the trunk's weight and protects pelvic organs.",
              "muscle": "The gluteal muscles (maximus, medius, minimus) extend the hip and steady the pelvis when walking.",
              "body": "Holds the bladder, rectum and internal reproductive organs."}},
    {"id": "thigh", "ny": [0.24, 0.5], "ax": [0.02, 1],
     "ar": "الفخذ", "en": "Thigh",
     "d_ar": {"skeleton": "عظم الفخذ: أطول وأقوى عظام الجسم، يتمفصل مع الحوض في الأعلى ومع الركبة في الأسفل.",
              "muscle": "الرباعية الرؤوس في الأمام تبسط الركبة، وخلف الفخذ العضلات الخلفية (ركبية) تثنيها.",
              "body": "يحمل الشريان والوريد الفخذيين والعصب الوركي."},
     "d_en": {"skeleton": "The femur: the longest, strongest bone, articulating with the pelvis above and the knee below.",
              "muscle": "The quadriceps in front straighten the knee; the hamstrings behind bend it.",
              "body": "Carries the femoral artery and vein and the sciatic nerve."}},
    {"id": "leg", "ny": [0.07, 0.24], "ax": [0, 1],
     "ar": "الساق", "en": "Lower leg",
     "d_ar": {"skeleton": "عظمان: الظنبوب (الأكبر والحامل للوزن) والشظية (الأنحف في الجهة الجانبية).",
              "muscle": "عضلات الربلة (التوأمية والنعلية) في الخلف ترفع الكعب، والظنبوبية الأمامية ترفع القدم.",
              "body": "الجزء بين الركبة والكاحل."},
     "d_en": {"skeleton": "Two bones: the tibia (larger, weight-bearing) and the slender fibula on the outer side.",
              "muscle": "The calf muscles (gastrocnemius, soleus) behind raise the heel; tibialis anterior in front lifts the foot.",
              "body": "The segment between the knee and the ankle."}},
    {"id": "foot", "ny": [0.0, 0.07], "ax": [0, 1],
     "ar": "القدم", "en": "Foot",
     "d_ar": {"skeleton": "7 عظام رصغية (أكبرها العقب والكاحل) و5 مشطيات و14 سلاميات، تكوّن أقواسًا تمتص الصدمات.",
              "muscle": "عضلات القدم الصغيرة وأوتار الساق تدعم قوس القدم وتدفع الجسم للأمام.",
              "body": "تحمل وزن الجسم وتدفعه أثناء المشي."},
     "d_en": {"skeleton": "7 tarsal bones (largest: calcaneus and talus), 5 metatarsals and 14 phalanges forming shock-absorbing arches.",
              "muscle": "Small foot muscles and leg tendons support the arch and push the body forward.",
              "body": "Carries the body's weight and propels it when walking."}},
]

SKULL_REGIONS = [
    {"id": "cranium", "ny": [0.5, 1.0], "nz": [0, 1], "ar": "قبو القحف (الجمجمة)", "en": "Cranial vault",
     "d_ar": "العظام التي تحيط بالدماغ وتحميه: الجبهي والجداريان والصدغيان والقذالي، وهي مرتبطة بدروز (مفاصل ليفية ثابتة).",
     "d_en": "The bones that enclose and protect the brain: frontal, two parietals, two temporals and the occipital, joined by sutures (fixed fibrous joints)."},
    {"id": "face", "ny": [0.25, 0.5], "nz": [0, 1], "ar": "عظام الوجه", "en": "Facial skeleton",
     "d_ar": "تشمل الفك العلوي وعظمي الوجنة والأنف ومحجري العينين والتجويف الأنفي. تعطي الوجه شكله وتحمي العينين وتحمل الأسنان العلوية.",
     "d_en": "The maxilla, zygomatic and nasal bones, the two orbits and the nasal cavity. They shape the face, protect the eyes and carry the upper teeth."},
    {"id": "mandible", "ny": [0.0, 0.25], "nz": [0.5, 1], "ar": "الفك السفلي", "en": "Mandible",
     "d_ar": "العظم المتحرك الوحيد في الجمجمة. يحمل الأسنان السفلية ويتمفصل مع العظم الصدغي في المفصل الفكي الصدغي ويتيح المضغ والكلام.",
     "d_en": "The skull's only movable bone. It carries the lower teeth and articulates with the temporal bone at the temporomandibular joint, allowing chewing and speech."},
    {"id": "cervical", "ny": [0.0, 0.25], "nz": [0, 0.5], "ar": "فقرات الرقبة", "en": "Cervical vertebrae",
     "d_ar": "أولى الفقرات تحت الجمجمة: الأطلس (C1) الذي يحمل الجمجمة، والمحور (C2) الذي يسمح بدوران الرأس.",
     "d_en": "The first vertebrae below the skull: the atlas (C1) carries the skull and the axis (C2) lets the head rotate."},
]

SPINE_REGIONS = [
    {"id": "cervical", "ny": [0.82, 1.0], "ar": "الفقرات الرقبية (C1-C7)", "en": "Cervical vertebrae (C1-C7)",
     "d_ar": "سبع فقرات تدعم الرأس وتسمح بحركته الواسعة. الأولى (الأطلس) والثانية (المحور) متخصصتان في الدوران.",
     "d_en": "Seven vertebrae that support the head and allow its wide movement; the atlas and axis are specialised for rotation."},
    {"id": "thoracic", "ny": [0.42, 0.82], "ar": "الفقرات الصدرية (T1-T12)", "en": "Thoracic vertebrae (T1-T12)",
     "d_ar": "اثنتا عشرة فقرة تتمفصل كل منها مع زوج من الأضلاع مكوّنةً القفص الصدري، وحركتها محدودة.",
     "d_en": "Twelve vertebrae, each articulating with a pair of ribs to form the rib cage; their movement is limited."},
    {"id": "lumbar", "ny": [0.18, 0.42], "ar": "الفقرات القطنية (L1-L5)", "en": "Lumbar vertebrae (L1-L5)",
     "d_ar": "خمس فقرات كبيرة وقوية تتحمل معظم وزن الجسم، وهي أكثر مواضع آلام الظهر.",
     "d_en": "Five large, strong vertebrae that bear most of the body's weight; the most common site of back pain."},
    {"id": "sacrum", "ny": [0.0, 0.18], "ar": "العجز والعصعص", "en": "Sacrum and coccyx",
     "d_ar": "العجز: خمس فقرات ملتحمة تتمفصل مع عظمي الحوض، ويليه العصعص (3-4 فقرات صغيرة ملتحمة).",
     "d_en": "The sacrum (five fused vertebrae) joins the hip bones, followed by the coccyx (3-4 small fused vertebrae)."},
]

data = {
    "by": BY,
    "regions": {
        "skeleton": {"kind": "skeleton", "list": BODY_REGIONS},
        "ecorche": {"kind": "muscle", "list": BODY_REGIONS},
        "muscleM": {"kind": "muscle", "list": BODY_REGIONS},
        "muscleF": {"kind": "muscle", "list": BODY_REGIONS},
        "skull": {"kind": "plain", "list": SKULL_REGIONS},
        "spine": {"kind": "plain", "list": SPINE_REGIONS},
    },
}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
print("wrote", OUT, sum(len(v) for v in BY.values()), "named rules,", len(BODY_REGIONS) + len(SKULL_REGIONS) + len(SPINE_REGIONS), "regions")
