#!/usr/bin/env python3
"""Sessim: gera os 24 bonecos (char_0..char_23) a partir dos 6 originais.

- char_0..5: os originais. Os 5 dos papéis ganham a roupa na cor do papel
  (a mesma do quadro de progresso); o char_2 (das sessões) troca a jaqueta
  laranja por preta, para o laranja ficar só com o construtor.
- char_6..23: cada um parte de um original (que define o penteado) e troca a
  cor do cabelo, da pele e da roupa. Alguns ganham um detalhe discreto:
  óculos, barba ou crachá.

A sombra do desenho é mantida: cada tom do grupo vira a cor-alvo com o mesmo
desvio de claridade que tinha em relação à média.

Uso: python3 scripts/sessim-gerar-bonecos.py [destino]
     (origem: scripts/sessim-bonecos/originais; destino padrão: webview-ui/public/assets/characters)
"""

import colorsys
import os
import sys

from PIL import Image

FW, FH, FRAMES = 16, 32, 7
FRENTE, COSTAS, LADO = 0, 1, 2

# Tons de cada parte em cada boneco original (levantados pela altura no desenho).
GRUPOS = {
    0: {
        "cabelo": ["32191d", "6d4726", "b18649", "8f6439", "341f20", "6f4a2a"],
        "pele": ["fbbf97", "ffd8b2", "c5896e", "e29878", "e9a384"],
        "roupa": ["114978", "071c2e", "0f406a", "1164a9"],
    },
    1: {
        "cabelo": ["f1c084", "e39f5a", "7e4b29", "be7743"],
        "pele": ["fbbf97", "ffd8b2", "c5896e", "e29878", "e9a384", "bd8068"],
        "roupa": ["1a1a1a", "252525", "2b2b2b", "101010"],
    },
    2: {
        "cabelo": ["2b2827", "252120", "181616", "221e1e", "282423", "1b1a19"],
        "pele": ["5f4132", "75503d", "593b2c", "865e4c", "493227"],
        "roupa": ["e1721d", "f67d20", "e8741b", "e87218", "ff8b31", "592700"],
        "roupa2": ["741713", "a91d18", "8b1a16", "56110e"],
        "calca": ["23294d", "49557e", "111528", "343d5a"],
    },
    3: {
        "cabelo": ["fff1ef", "e9d7d4", "b0a6a3", "daccc9", "f0e1de", "bfb6b3"],
        "pele": ["ac6847", "ffa77c", "e08d64", "b67352", "8c583f"],
        "roupa": ["bdbdbd", "eeeeee", "d4d4d4", "4c4c4c"],
        "calca": ["796064", "ac9082", "3c314f", "d2b48e"],
    },
    4: {
        "cabelo": ["69451b", "57351a", "2f160f", "432415", "442414", "421b19"],
        "pele": ["fbbf97", "ffd8b2", "c5896e", "e29878", "e9a384", "bd8068"],
        "roupa": ["bdbdbd", "eeeeee", "d4d4d4", "4c4c4c"],
        "calca": ["0b100c", "0f406a", "071c2e", "114978"],
    },
    5: {
        "cabelo": ["131313", "202020", "282828", "373737", "0e0e0e", "414141", "303030"],
        "pele": ["ffede5", "fff6f2", "cf9d86", "ba917e", "fcd6c4", "e1aa91"],
        "roupa": ["9f3f31", "e16451", "b24737", "640026"],
        "calca": ["1d1718", "332c23", "0f0c13", "2a2320"],
    },
}

# Cores-alvo (o tom médio de cada parte).
CABELO = {
    "preto": "1c1a1e",
    "castanho": "5a3820",
    "ruivo": "c4501c",
    "loiro": "e8c060",
    "platinado": "e6e2d8",
    "grisalho": "9a9a9e",
    "rosa": "e86fa6",
    "azul": "3a6fd8",
    "roxo": "8a4fd0",
    "verde": "2fa86a",
}
PELE = {
    "clara": "f2c6a8",
    "media": "d49a72",
    "morena": "a8683f",
    "escura": "6a4430",
}
# Cores dos papéis: as mesmas de SESSIM_COLOR_* em webview-ui/src/constants.ts.
PAPEL = {
    "construtor": "d85a30",
    "explorador": "1d9e75",
    "implementador": "378add",
    "verificador": "ba7517",
    "arquiteto": "7f77dd",
}
# Roupas das sessões: longe das cores dos papéis (sem laranja, verde-água,
# azul médio, âmbar nem lilás), para a cor do papel continuar só dele.
ROUPA = {
    "vinho": "8a1f3a",
    "vermelho": "c8302c",
    "marinho": "1e2f5c",
    "rosa": "e0609a",
    "coral": "f07a6a",
    "oliva": "6b7a2a",
    "branco": "e8e8ec",
    "cinza": "5c5f66",
    "marrom": "7a4a28",
    "preto": "26262a",
    "caqui": "b89a68",
    "jeans": "3a5a90",
}

# O char_2 é das sessões: a jaqueta laranja dele (cor do construtor) vira preta.
JAQUETA_DO_CHAR_2 = "preto"

# Boneco do papel (mesmas paletas de SESSIM_ROLE_PALETTES) → cor da roupa.
ROUPA_DO_PAPEL = {
    0: "construtor",
    1: "explorador",
    3: "implementador",
    4: "verificador",
    5: "arquiteto",
}

# Boneco novo = original + cores + detalhe. No mesmo penteado o cabelo e a
# roupa sempre mudam; nenhum repete a combinação cabelo + roupa de outro.
NOVOS = [
    # penteado 0: cabelo curto, terno
    (0, {"cabelo": "preto", "pele": "escura", "roupa": "cinza"}, "oculos"),
    (0, {"cabelo": "ruivo", "pele": "clara", "roupa": "vinho"}, "cracha"),
    (0, {"cabelo": "platinado", "pele": "media", "roupa": "caqui"}, "barba"),
    # penteado 1: cabelo longo trançado, vestido
    (1, {"cabelo": "preto", "pele": "escura", "roupa": "vermelho"}, None),
    (1, {"cabelo": "ruivo", "pele": "clara", "roupa": "rosa"}, None),
    (1, {"cabelo": "rosa", "pele": "media", "roupa": "marinho"}, "oculos"),
    # penteado 2: black power, jaqueta + camiseta + calça
    (2, {"cabelo": "castanho", "pele": "media", "roupa": "vinho", "roupa2": "branco", "calca": "preto"}, "barba"),
    (2, {"cabelo": "ruivo", "pele": "clara", "roupa": "vermelho", "roupa2": "preto", "calca": "caqui"}, "cracha"),
    (2, {"cabelo": "grisalho", "pele": "morena", "roupa": "marinho", "roupa2": "rosa", "calca": "cinza"}, "oculos"),
    # penteado 3: cabelo volumoso, camiseta + calça
    (3, {"cabelo": "rosa", "pele": "clara", "roupa": "vermelho", "calca": "jeans"}, None),
    (3, {"cabelo": "azul", "pele": "escura", "roupa": "rosa", "calca": "preto"}, "cracha"),
    (3, {"cabelo": "castanho", "pele": "media", "roupa": "coral", "calca": "caqui"}, "oculos"),
    # penteado 4: espetado, camiseta + jeans
    (4, {"cabelo": "loiro", "pele": "morena", "roupa": "vermelho", "calca": "caqui"}, None),
    (4, {"cabelo": "preto", "pele": "morena", "roupa": "oliva", "calca": "preto"}, "barba"),
    (4, {"cabelo": "roxo", "pele": "clara", "roupa": "rosa", "calca": "cinza"}, "cracha"),
    # penteado 5: cabelo liso escuro, camiseta + calça
    (5, {"cabelo": "platinado", "pele": "media", "roupa": "cinza", "calca": "caqui"}, "oculos"),
    (5, {"cabelo": "ruivo", "pele": "escura", "roupa": "preto", "calca": "jeans"}, "barba"),
    (5, {"cabelo": "verde", "pele": "morena", "roupa": "branco", "calca": "marrom"}, "cracha"),
]

TABELAS = {"cabelo": CABELO, "pele": PELE, "roupa": ROUPA, "roupa2": ROUPA, "calca": ROUPA}


def hex_rgb(h):
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def hls(rgb):
    return colorsys.rgb_to_hls(*(c / 255 for c in rgb))


def tom(alvo_hex, dl):
    """Cor-alvo com a claridade deslocada em `dl`."""
    h, l, s = hls(hex_rgb(alvo_hex))
    r, g, b = colorsys.hls_to_rgb(h, max(0.03, min(0.97, l + dl)), s)
    return (round(r * 255), round(g * 255), round(b * 255), 255)


def mapa_do_grupo(tons, alvo_hex):
    """Mapeia cada tom do grupo para a cor-alvo, preservando o degradê de claridade."""
    alvo_h, alvo_l, alvo_s = hls(hex_rgb(alvo_hex))
    ls = [hls(hex_rgb(t))[1] for t in tons]
    media = sum(ls) / len(ls)
    lo, hi = min(ls), max(ls)
    # Degradê largo demais (ex.: cabelo branco → preto) é comprimido para caber.
    espaco = min(alvo_l, 1 - alvo_l) * 1.6
    escala = min(1.0, espaco / max(hi - media, media - lo, 1e-6))
    mapa = {}
    for t, l in zip(tons, ls):
        nl = max(0.03, min(0.97, alvo_l + (l - media) * escala))
        r, g, b = colorsys.hls_to_rgb(alvo_h, nl, alvo_s)
        mapa[hex_rgb(t)] = (round(r * 255), round(g * 255), round(b * 255))
    return mapa


# ── Detalhes discretos ──────────────────────────────────────────


def quadros(im):
    for d in (FRENTE, COSTAS, LADO):
        for f in range(FRAMES):
            yield d, f, f * FW, d * FH


def opaco(px, x, y):
    return px[x, y][3] > 0


def topo(px, ox, oy):
    for y in range(FH):
        for x in range(FW):
            if opaco(px, ox + x, oy + y):
                return y, x
    return 0, 0


def mascara_oculos(orig):
    """Pixels dos óculos que o desenho original já tem nos quadros de leitura
    (5 e 6), relativos ao topo da cabeça, por direção."""
    px = orig.load()
    mascaras = {}
    for d in (FRENTE, LADO):
        pontos = set()
        for f_ler, f_base in ((5, 3), (6, 4)):
            ox, oy = f_ler * FW, d * FH
            bx = f_base * FW
            t, tx = topo(px, ox, oy)
            for y in range(t, min(t + 20, FH)):
                for x in range(FW):
                    a, b = px[ox + x, oy + y], px[bx + x, oy + y]
                    if a[:3] == (0, 0, 0) and a[3] and a != b:
                        pontos.add((x - tx, y - t))
        mascaras[d] = pontos
    return mascaras


def pele_do_rosto(orig, pele, ox, oy):
    """Linhas do rosto com pele: {y: [x...]} nas 20 primeiras linhas da cabeça."""
    px = orig.load()
    t, _ = topo(px, ox, oy)
    linhas = {}
    for y in range(t, min(t + 20, FH)):
        xs = [x for x in range(FW) if px[ox + x, oy + y][3] and px[ox + x, oy + y][:3] in pele]
        if xs:
            linhas[y] = xs
    return linhas


def aplicar_detalhe(orig, im, base, detalhe, cores):
    if not detalhe:
        return
    po, pi = orig.load(), im.load()
    pele = {hex_rgb(t) for t in GRUPOS[base]["pele"]}
    if detalhe == "oculos":
        masc = mascara_oculos(orig)
        # Armação escura; prateada na pele escura, para não sumir.
        armacao = (210, 212, 220, 255) if cores["pele"] == "escura" else (24, 22, 28, 255)
        for d, f, ox, oy in quadros(orig):
            if d == COSTAS or f in (5, 6):
                continue
            t, tx = topo(po, ox, oy)
            for dx, dy in masc[d]:
                x, y = tx + dx, t + dy
                if 0 <= x < FW and 0 <= y < FH and po[ox + x, oy + y][3]:
                    pi[ox + x, oy + y] = armacao
    elif detalhe == "barba":
        barba = tom(CABELO[cores["cabelo"]], -0.06)
        sombra = tom(CABELO[cores["cabelo"]], -0.14)
        for d, f, ox, oy in quadros(orig):
            if d == COSTAS:
                continue
            linhas = pele_do_rosto(orig, pele, ox, oy)
            largas = [y for y, xs in linhas.items() if len(xs) >= 4]
            if not largas:
                continue
            queixo = max(largas)
            for x in linhas[queixo]:
                pi[ox + x, oy + queixo] = barba
            # Costeletas: o pixel de pele mais de fora da linha de cima.
            acima = linhas.get(queixo - 1, [])
            if acima:
                pi[ox + min(acima), oy + queixo - 1] = sombra
                if d == FRENTE:
                    pi[ox + max(acima), oy + queixo - 1] = sombra
    elif detalhe == "cracha":
        cartao = (240, 240, 236, 255)
        faixa = (34, 197, 94, 255)  # verde DevStart
        for d, f, ox, oy in quadros(orig):
            if d == COSTAS:
                continue
            linhas = pele_do_rosto(orig, pele, ox, oy)
            largas = [y for y, xs in linhas.items() if len(xs) >= 4]
            if not largas:
                continue
            y0 = max(largas) + 3
            xs = linhas[max(largas)]
            if d == FRENTE:
                x0 = (min(xs) + max(xs)) // 2 + 2
                pontos = [(x0, y0, cartao), (x0 + 1, y0, cartao), (x0, y0 + 1, faixa), (x0 + 1, y0 + 1, faixa)]
            else:
                x0 = max(xs) - 1
                pontos = [(x0, y0, cartao), (x0, y0 + 1, faixa)]
            for x, y, c in pontos:
                if 0 <= x < FW and 0 <= y < FH and po[ox + x, oy + y][3]:
                    pi[ox + x, oy + y] = c


def recolorir(im, mapa):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = px[x, y]
            if p[3] and p[:3] in mapa:
                px[x, y] = (*mapa[p[:3]], p[3])


# ── Bonecos especiais (cabeça desenhada à mão sobre o corpo de um original) ──

# Senhor de chapéu-panamá: corpo do char_0 (terno azul-marinho), camisa
# azul-clara, gravata azul estampada, broche na lapela; cabeça redesenhada com
# chapéu de palha de aba larga, sorriso de olhos apertados e barba branca cheia.
CORES_CABECA = {
    "K": (110, 84, 44, 255),    # contorno do chapéu
    "H": (242, 224, 164, 255),  # palha clara
    "h": (222, 196, 128, 255),  # palha média
    "s": (186, 154, 92, 255),   # palha na sombra (debaixo da aba)
    "B": (28, 26, 30, 255),     # fita preta
    "G": (204, 200, 194, 255),  # cabelo grisalho
    "g": (156, 152, 146, 255),  # cabelo na sombra
    "O": (92, 64, 52, 255),     # contorno do rosto
    "S": (236, 180, 148, 255),  # pele
    "D": (200, 140, 112, 255),  # pele na sombra
    "E": (52, 36, 32, 255),     # olho apertado
    "W": (240, 238, 234, 255),  # barba
    "w": (190, 186, 178, 255),  # barba na sombra
    "T": (255, 255, 255, 255),  # dentes
}
CABECA = {
    FRENTE: [
        "....KKKKKKKK....",
        "...KhHHsHHHhK...",
        "...KhHHHHHHhK...",
        "...KBBBBBBBBK...",
        ".KhHHHHHHHHHHhK.",
        "KssssssssssssssK",
        "..GODDDDDDDDOG..",
        "..GOSSSSSSSSOG..",
        "..GSEESSSSEESG..",
        "..GSSSSDDSSSSG..",
        "..WWSSWWWWSSWW..",
        "..WWWTTTTTTWWW..",
        "...WWWwwwwWWW...",
        "....wWWWWWWw....",
    ],
    LADO: [
        ".....KKKKKKK....",
        "....KhHHsHHHK...",
        "....KhHHHHHHK...",
        "....KBBBBBBBK...",
        "..KhHHHHHHHHHHK.",
        "..KssssssssssssK",
        "...GGGODDDDDO...",
        "...GGGSSSSSSO...",
        "...GgGSSSSESSO..",
        "...GGSSSSSSSSSO.",
        "...GWWSSSWWWWO..",
        "....WWWWWTTTW...",
        "....wWWWWWWWw...",
        ".....wWWWWWw....",
    ],
    COSTAS: [
        "....KKKKKKKK....",
        "...KhHHHHHHhK...",
        "...KhHHHHHHhK...",
        "...KBBBBBBBBK...",
        ".KhHHHHHHHHHHhK.",
        "KssssssssssssssK",
        "..GGGGGGGGGGGG..",
        "..GGGGGGGGGGGG..",
        "..gGGGGGGGGGGg..",
        "...gGGGGGGGGg...",
        "...SggggggggS...",
        "....SSSSSSSS....",
        "....SSSSSSSS....",
        "....DSSSSSSD....",
    ],
}
CAMISA = (214, 228, 246, 255)
GRAVATA = [(52, 80, 140, 255), (120, 150, 210, 255)]
BROCHE = (222, 186, 74, 255)
PESCOCO = (0x84, 0x52, 0x3A)


def boneco_chapeu_panama(orig):
    base = 0
    cabelo = {hex_rgb(t) for t in GRUPOS[base]["cabelo"]}
    roupa = {hex_rgb(t) for t in GRUPOS[base]["roupa"]}
    im = orig.copy()
    recolorir(im, mapa_do_grupo(GRUPOS[base]["roupa"], "1c2c5a"))
    po, pi = orig.load(), im.load()
    altura = len(CABECA[FRENTE])
    for d, f, ox, oy in quadros(orig):
        t, _ = topo(po, ox, oy)
        # Centro da cabeça original, para alinhar o desenho novo.
        xs = [x for x in range(FW) if po[ox + x, oy + t + 5][3] and po[ox + x, oy + t + 5][:3] in cabelo]
        dx = round((min(xs) + max(xs)) / 2 - 7.5) if xs else 0
        # Apaga a cabeça antiga (mantém o que não é cabeça, como a caneta).
        cabeca_antiga = cabelo | {hex_rgb(c) for c in GRUPOS[base]["pele"]} | {
            (0, 0, 0), (255, 255, 255), (0x4F, 0x4F, 0x4F), (0x49, 0x3E, 0x38)}
        for y in range(t, min(t + altura, FH)):
            for x in range(FW):
                if po[ox + x, oy + y][3] and po[ox + x, oy + y][:3] in cabeca_antiga:
                    pi[ox + x, oy + y] = (0, 0, 0, 0)
        for ry, linha in enumerate(CABECA[d]):
            for rx, ch in enumerate(linha):
                x, y = rx + dx, t + ry
                if ch != "." and 0 <= x < FW and 0 <= y < FH:
                    pi[ox + x, oy + y] = CORES_CABECA[ch]
        if d == COSTAS:
            continue
        pescoco = t + altura
        for x in range(FW):
            if po[ox + x, oy + pescoco][:3] == PESCOCO:
                pi[ox + x, oy + pescoco] = CORES_CABECA["w"]
        if f in (5, 6):
            continue  # quadros com o papel na mão
        esq = None
        for y in range(pescoco, min(pescoco + 10, FH)):
            for x in range(FW):
                c = po[ox + x, oy + y]
                if not c[3]:
                    continue
                if c[:3] == (255, 255, 255):
                    pi[ox + x, oy + y] = CAMISA
                elif c[:3] == (4, 6, 5):
                    pi[ox + x, oy + y] = GRAVATA[(x + y) % 3 == 0]
                    esq = x if esq is None else min(esq, x)
        if d == FRENTE and esq is not None:
            x, y = esq + 4, pescoco + 3
            if po[ox + x, oy + y][3] and po[ox + x, oy + y][:3] in roupa:
                pi[ox + x, oy + y] = BROCHE
    return im


# Presidiário: o mesmo senhor de chapéu-panamá, com macacão laranja, plaquinha
# de número no peito, bola de ferro no pé e placa de ficha policial ao ler.
TERNO_NIVEL = {
    (11, 17, 36): "o", (27, 43, 88): "s", (31, 49, 100): "m", (43, 67, 137): "l",
    CAMISA[:3]: "m", GRAVATA[0][:3]: "m", GRAVATA[1][:3]: "m", BROCHE[:3]: "m", (4, 6, 5): "m",
}
LARANJA = {"o": (14, 14, 16), "s": (196, 82, 24), "m": (236, 112, 36), "l": (252, 148, 68)}
PAPEL_BORDA = (0x39, 0x16, 0x24)
BOLA = [".KKK.", "KHMMK", "KMMMK", "KMMDK", ".KKK."]
BOLA_CORES = {"K": (16, 16, 20, 255), "H": (200, 204, 212, 255), "M": (120, 124, 134, 255), "D": (84, 86, 96, 255)}


def vestir_presidiario(terno):
    im = terno.copy()
    po, px = terno.load(), im.load()
    for y in range(im.height):
        for x in range(im.width):
            p = po[x, y]
            n = TERNO_NIVEL.get(p[:3]) if p[3] else None
            if n:
                px[x, y] = (*LARANJA[n], 255)
    for d, f, ox, oy in quadros(terno):
        uni = [(x, y) for y in range(FH) for x in range(FW)
               if po[ox + x, oy + y][3] and po[ox + x, oy + y][:3] in TERNO_NIVEL]
        if not uni:
            continue
        t0 = min(y for _, y in uni)
        fundo = max(y for y in range(FH) for x in range(FW) if po[ox + x, oy + y][3])
        if d == FRENTE and f in (5, 6):
            borda = [(x, y) for y in range(FH) for x in range(FW)
                     if po[ox + x, oy + y][3] and po[ox + x, oy + y][:3] == PAPEL_BORDA]
            if borda:
                x0, x1 = min(x for x, _ in borda), max(x for x, _ in borda)
                y0, y1 = min(y for _, y in borda), max(y for _, y in borda)
                for y in range(y0, y1 + 1):
                    for x in range(x0, x1 + 1):
                        c = po[ox + x, oy + y]
                        if not c[3]:
                            continue
                        if c[:3] == PAPEL_BORDA:
                            px[ox + x, oy + y] = (150, 150, 156, 255)
                        elif c[:3] == (255, 255, 255):
                            px[ox + x, oy + y] = (24, 24, 28, 255)
                        else:
                            px[ox + x, oy + y] = (245, 245, 245, 255)
        elif d == FRENTE:
            xs = [x for x, y in uni if y == t0 + 3]
            if xs:
                cx = (min(xs) + max(xs)) // 2
                for dy in range(3):
                    for dx in range(6):
                        escuro = dy == 1 and dx in (1, 2, 4)
                        px[ox + cx - 3 + dx, oy + t0 + 2 + dy] = (20, 20, 22, 255) if escuro else (250, 250, 250, 255)
        lado = -1 if d == LADO else 1
        pes = [x for x in range(FW) if po[ox + x, oy + fundo][3]]
        xp = max(pes) if lado > 0 else min(pes)
        bx = max(0, min(FW - 5, xp + 1 if lado > 0 else xp - 5))
        for ry, linha in enumerate(BOLA):
            for rx, ch in enumerate(linha):
                x, y = bx + rx, fundo - 4 + ry
                if ch != "." and 0 <= x < FW and 0 <= y < FH and not po[ox + x, oy + y][3]:
                    px[ox + x, oy + y] = BOLA_CORES[ch]
        x = xp + lado
        if 0 <= x < FW and not po[ox + x, oy + fundo - 1][3]:
            px[ox + x, oy + fundo - 1] = (190, 192, 200, 255)
    return im


def boneco_presidiario(orig):
    return vestir_presidiario(boneco_chapeu_panama(orig))


ESPECIAIS = [boneco_presidiario]


def gerar(origem, destino):
    originais = [Image.open(os.path.join(origem, f"char_{i}.png")).convert("RGBA") for i in range(6)]
    for i, orig in enumerate(originais):
        im = orig.copy()
        if i in ROUPA_DO_PAPEL:
            recolorir(im, mapa_do_grupo(GRUPOS[i]["roupa"], PAPEL[ROUPA_DO_PAPEL[i]]))
        elif i == 2:
            recolorir(im, mapa_do_grupo(GRUPOS[2]["roupa"], ROUPA[JAQUETA_DO_CHAR_2]))
        im.save(os.path.join(destino, f"char_{i}.png"))
    for n, (base, cores, detalhe) in enumerate(NOVOS, start=6):
        orig = originais[base]
        im = orig.copy()
        mapa = {}
        for parte, nome in cores.items():
            mapa.update(mapa_do_grupo(GRUPOS[base][parte], TABELAS[parte][nome]))
        recolorir(im, mapa)
        aplicar_detalhe(orig, im, base, detalhe, cores)
        im.save(os.path.join(destino, f"char_{n}.png"))
    for n, fazer in enumerate(ESPECIAIS, start=6 + len(NOVOS)):
        fazer(originais[0]).save(os.path.join(destino, f"char_{n}.png"))
    total = 6 + len(NOVOS) + len(ESPECIAIS)
    print(f"{total} bonecos gerados (char_0 a char_{total - 1}) em {destino}")


if __name__ == "__main__":
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    origem = os.path.join(raiz, "scripts/sessim-bonecos/originais")
    destino = sys.argv[1] if len(sys.argv) > 1 else os.path.join(raiz, "webview-ui/public/assets/characters")
    os.makedirs(destino, exist_ok=True)
    gerar(origem, destino)
