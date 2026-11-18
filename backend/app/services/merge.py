"""Склейка презентаций участников в одну .pptx.

Слайды копируются вместе со своими макетами, мастерами, темами и медиа на уровне
OPC-пакета, поэтому оформление каждой исходной презентации сохраняется.
Между участниками вставляются разделительные слайды в стиле сайта.
"""

from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.opc.packuri import PackURI
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt

WIDE = (Emu(12192000), Emu(6858000))  # 16:9
FONT = "Calibri"

_DROP_REL_SUFFIXES = ("/notesSlide", "/comments", "/commentAuthors")
_PARTNAME_RE = re.compile(r"^(?P<dir>.*/)(?P<stem>[^/]*?)(?P<num>\d*)(?P<ext>\.[^./]+)$")


@dataclass
class MergeItem:
    path: Path
    full_name: str
    grade: str


@dataclass
class Branding:
    site_title: str
    event_name: str | None
    section_name: str
    primary_color: str  # "#rrggbb"


@dataclass
class MergeResult:
    slides_count: int
    participants_count: int
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------- colors ---


def _hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _mix(c: tuple[int, int, int], other: tuple[int, int, int], t: float) -> RGBColor:
    return RGBColor(*(round(a + (b - a) * t) for a, b in zip(c, other)))


def _is_light(c: tuple[int, int, int]) -> bool:
    def lin(v: int) -> float:
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    lum = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
    return lum > 0.45


# ------------------------------------------------------- branded slides ---


def _set_alpha(shape, alpha_pct: int) -> None:
    """Прозрачность заливки фигуры (python-pptx не умеет это из коробки)."""
    srgb = shape.fill._xPr.find(".//" + qn("a:srgbClr"))
    if srgb is not None:
        el = etree.SubElement(srgb, qn("a:alpha"))
        el.set("val", str(alpha_pct * 1000))


def _text(slide, left, top, width, height, text, size, color, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = 0
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.name = FONT
    run.font.color.rgb = color
    return tb


def _branded_base(prs, branding: Branding):
    """Пустой слайд с фирменным фоном. Возвращает (slide, основной цвет текста, приглушённый цвет)."""
    W, H = prs.slide_width, prs.slide_height
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # Blank
    base = _hex_to_rgb(branding.primary_color)
    light = _is_light(base)
    fg = RGBColor(0x11, 0x18, 0x27) if light else RGBColor(0xFF, 0xFF, 0xFF)
    fg_t = (0x11, 0x18, 0x27) if light else (0xFF, 0xFF, 0xFF)
    muted = _mix(base, fg_t, 0.7)

    bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, H)
    bg.line.fill.background()
    bg.fill.gradient()
    bg.fill.gradient_angle = 135
    stops = bg.fill.gradient_stops
    stops[0].color.rgb = _mix(base, (255, 255, 255), 0.12)
    stops[0].position = 0
    stops[1].color.rgb = _mix(base, (0, 0, 0), 0.35)
    stops[1].position = 1.0

    # Декоративные полупрозрачные круги
    for x, y, d, a in ((0.68, -0.25, 0.62, 10), (0.80, 0.45, 0.42, 8), (-0.12, 0.70, 0.35, 6)):
        c = slide.shapes.add_shape(MSO_SHAPE.OVAL, int(W * x), int(H * y), int(W * d), int(W * d))
        c.line.fill.background()
        c.fill.solid()
        c.fill.fore_color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        _set_alpha(c, a)

    pad = int(W * 0.06)
    # Акцентная полоска и заголовок сайта
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, pad, int(H * 0.09), int(W * 0.04), Emu(54000))
    bar.line.fill.background()
    bar.fill.solid()
    bar.fill.fore_color.rgb = fg
    header = branding.site_title
    if branding.event_name:
        header = f"{branding.site_title} · {branding.event_name}"
    _text(slide, pad, int(H * 0.11), int(W * 0.8), int(H * 0.08), header, 16, muted)
    return slide, fg, muted, pad


def _add_title_slide(prs, branding: Branding, total: int) -> None:
    W, H = prs.slide_width, prs.slide_height
    slide, fg, muted, pad = _branded_base(prs, branding)
    _text(slide, pad, int(H * 0.30), int(W * 0.85), int(H * 0.1), "СЕКЦИЯ", 18, muted, bold=True)
    _text(slide, pad, int(H * 0.38), int(W * 0.85), int(H * 0.3), branding.section_name, 54, fg, bold=True)
    word = _plural(total, "выступление", "выступления", "выступлений")
    _text(slide, pad, int(H * 0.80), int(W * 0.6), int(H * 0.08), f"{total} {word}", 18, muted)


def _add_separator_slide(prs, branding: Branding, item: MergeItem, idx: int, total: int) -> None:
    W, H = prs.slide_width, prs.slide_height
    slide, fg, muted, pad = _branded_base(prs, branding)
    _text(slide, pad, int(H * 0.30), int(W * 0.85), int(H * 0.08), "СЛЕДУЮЩИЙ УЧАСТНИК", 18, muted, bold=True)
    tb = _text(slide, pad, int(H * 0.37), int(W * 0.85), int(H * 0.38), item.full_name, 48, fg, bold=True)
    if item.grade:
        p = tb.text_frame.add_paragraph()
        p.space_before = Pt(14)
        run = p.add_run()
        run.text = f"{item.grade} класс"
        run.font.size = Pt(28)
        run.font.name = FONT
        run.font.color.rgb = fg
    _text(slide, pad, int(H * 0.82), int(W * 0.5), int(H * 0.07), branding.section_name, 16, muted)
    _text(
        slide, int(W * 0.6), int(H * 0.78), int(W - W * 0.6 - pad), int(H * 0.12), f"{idx} / {total}", 40, fg,
        bold=True, align=PP_ALIGN.RIGHT,
    )


def _plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


# ------------------------------------------------------- package surgery ---


def _walk_parts(start_parts, stop: set[int]):
    """Все внутренние части, достижимые из start_parts (кроме stop)."""
    seen: dict[int, object] = {}
    stack = list(start_parts)
    while stack:
        part = stack.pop()
        if id(part) in seen or id(part) in stop:
            continue
        seen[id(part)] = part
        for rel in part.rels.values():
            if not rel.is_external:
                stack.append(rel.target_part)
    return list(seen.values())


def _import_presentation(dest, src_path: Path, used_names: set[str], counters: Counter) -> list:
    """Подключает слайды src к dest. Возвращает список slide parts в исходном порядке."""
    src = Presentation(str(src_path))
    src_prs_part = src.part

    slide_parts = []
    for sldId in src.slides._sldIdLst:
        sp = src_prs_part.related_part(sldId.rId)
        # Удаляем заметки и комментарии — они ссылаются на объекты уровня презентации
        for rId, rel in list(sp.rels.items()):
            if rel.reltype.endswith(_DROP_REL_SUFFIXES):
                sp.rels.pop(rId)
        slide_parts.append(sp)

    masters = []
    for sp in slide_parts:
        layout = sp.part_related_by(RT.SLIDE_LAYOUT)
        master = layout.part_related_by(RT.SLIDE_MASTER)
        if master not in masters:
            masters.append(master)

    # Переименовываем все импортируемые части, чтобы не было коллизий имён
    for part in _walk_parts(slide_parts + masters, stop={id(src_prs_part)}):
        m = _PARTNAME_RE.match(str(part.partname))
        if not m:
            continue
        key = (m["dir"], m["stem"], m["ext"])
        while True:
            counters[key] += 1
            name = f"{m['dir']}{m['stem']}{counters[key]}{m['ext']}"
            if name not in used_names:
                break
        used_names.add(name)
        part.partname = PackURI(name)
        for rel in part.rels.values():
            rel.__dict__.pop("target_ref", None)

    # Регистрируем мастера в целевой презентации
    master_lst = dest.part._element.find(qn("p:sldMasterIdLst"))
    for master in masters:
        rId = dest.part.relate_to(master, RT.SLIDE_MASTER)
        el = etree.SubElement(master_lst, qn("p:sldMasterId"))
        el.set("id", "0")  # перенумеруем позже
        el.set(qn("r:id"), rId)

    return slide_parts


def _renumber_master_ids(dest) -> None:
    """id мастеров и макетов должны быть уникальны в пределах всей презентации."""
    next_id = 2147483648
    for el in dest.part._element.find(qn("p:sldMasterIdLst")):
        el.set("id", str(next_id))
        next_id += 1
        master = dest.part.related_part(el.get(qn("r:id")))
        lst = master._element.find(qn("p:sldLayoutIdLst"))
        if lst is None:
            continue
        for lay in lst:
            lay.set("id", str(next_id))
            next_id += 1


def merge_presentations(items: list[MergeItem], branding: Branding, out_path: Path) -> MergeResult:
    warnings: list[str] = []

    sizes: list[tuple[int, int]] = []
    for it in items:
        try:
            p = Presentation(str(it.path))
            sizes.append((p.slide_width, p.slide_height))
        except Exception:  # noqa: BLE001
            sizes.append(WIDE)
    size = Counter(sizes).most_common(1)[0][0] if sizes else WIDE

    dest = Presentation()
    dest.slide_width, dest.slide_height = size
    # Убираем разделы (если есть) — они бы ссылались на несуществующие id
    ext_lst = dest.part._element.find(qn("p:extLst"))
    if ext_lst is not None:
        dest.part._element.remove(ext_lst)

    used_names = {str(p.partname) for p in dest.part.package.iter_parts()}
    counters: Counter = Counter()

    total = len(items)
    _add_title_slide(dest, branding, total)
    order: list[str] = [dest.slides._sldIdLst[0].rId]

    sldIdLst = dest.slides._sldIdLst
    for idx, item in enumerate(items, start=1):
        _add_separator_slide(dest, branding, item, idx, total)
        order.append(sldIdLst[-1].rId)
        try:
            slide_parts = _import_presentation(dest, item.path, used_names, counters)
        except Exception as e:  # noqa: BLE001
            warnings.append(f"{item.full_name}: не удалось прочитать презентацию ({e.__class__.__name__})")
            continue
        if sizes[idx - 1] != size:
            warnings.append(f"{item.full_name}: размер слайдов отличается от остальных, оформление может съехать")
        if not slide_parts:
            warnings.append(f"{item.full_name}: в презентации нет слайдов")
        for sp in slide_parts:
            rId = dest.part.relate_to(sp, RT.SLIDE)
            sldIdLst.add_sldId(rId)
            order.append(rId)

    # Порядок слайдов: титульный → (разделитель → слайды участника)*
    by_rid = {el.rId: el for el in sldIdLst}
    for el in list(sldIdLst):
        sldIdLst.remove(el)
    for rId in order:
        sldIdLst.append(by_rid[rId])

    _renumber_master_ids(dest)
    dest.part.rename_slide_parts([el.rId for el in sldIdLst])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    dest.save(str(out_path))
    return MergeResult(slides_count=len(order), participants_count=total, warnings=warnings)
