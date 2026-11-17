"""Shrinks a heavy glTF (one .bin, triangle meshes with POSITION/NORMAL/TEXCOORD_0) by
vertex clustering on one grid shared by the whole model, so neighbouring pieces keep meeting.

    python tools/decimate_gltf.py static/models/skull/scene.gltf 260
      (the last number = grid cells along the longest side; lower = lighter)

Pure Python (no numpy), so it takes a minute or two on a few million vertices."""
import json
import sys
from array import array
from pathlib import Path


def main(path, cells):
    gp = Path(path)
    g = json.loads(gp.read_text(encoding="utf-8"))
    buf = array("B")
    buf.frombytes((gp.parent / g["buffers"][0]["uri"]).read_bytes())
    raw = memoryview(buf)
    A, BV = g["accessors"], g["bufferViews"]

    def floats(ai, n):
        a, bv = A[ai], BV[A[ai]["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        out = array("f"); out.frombytes(raw[off:off + a["count"] * n * 4].tobytes()); return out

    def indices(ai):
        a, bv = A[ai], BV[A[ai]["bufferView"]]
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        code = {5125: "I", 5123: "H", 5121: "B"}[a["componentType"]]
        out = array(code); out.frombytes(raw[off:off + a["count"] * out.itemsize].tobytes())
        return out

    prims = []
    lo = [1e30] * 3; hi = [-1e30] * 3
    for mesh in g["meshes"]:
        for p in mesh["primitives"]:
            at = p["attributes"]
            pos = floats(at["POSITION"], 3)
            for i in range(0, len(pos), 3):
                for k in range(3):
                    v = pos[i + k]
                    if v < lo[k]: lo[k] = v
                    if v > hi[k]: hi[k] = v
            prims.append((p, pos, floats(at["NORMAL"], 3) if "NORMAL" in at else None,
                          floats(at["TEXCOORD_0"], 2) if "TEXCOORD_0" in at else None, indices(p["indices"])))
    size = max(hi[k] - lo[k] for k in range(3))
    cell = size / cells
    print(f"{len(prims)} primitives, longest side {size:.3f}, cell {cell:.5f}")

    def key(x, y, z):
        return (int((x - lo[0]) / cell), int((y - lo[1]) / cell), int((z - lo[2]) / cell))

    # pass 1: one representative vertex per grid cell (mean position + normal, first UV seen)
    acc = {}
    cellof = []
    for p, pos, nrm, uv, idx in prims:
        m = []
        for v in range(len(pos) // 3):
            k = key(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2])
            e = acc.get(k)
            if e is None:
                e = acc[k] = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0, 0.0, 0.0]
                if uv is not None:
                    e[7], e[8] = uv[2 * v], uv[2 * v + 1]
            e[0] += pos[3 * v]; e[1] += pos[3 * v + 1]; e[2] += pos[3 * v + 2]
            if nrm is not None:
                e[3] += nrm[3 * v]; e[4] += nrm[3 * v + 1]; e[5] += nrm[3 * v + 2]
            e[6] += 1
            m.append(k)
        cellof.append(m)

    # pass 2: rebuild every primitive with its own compact vertex list
    out_buf = bytearray()
    new_views, new_acc = [], []

    def add(data, target, count, typ, ctype, mn=None, mx=None):
        while len(out_buf) % 4:
            out_buf.append(0)
        new_views.append({"buffer": 0, "byteOffset": len(out_buf), "byteLength": len(data), "target": target})
        out_buf.extend(data)
        a = {"bufferView": len(new_views) - 1, "componentType": ctype, "count": count, "type": typ}
        if mn is not None:
            a["min"], a["max"] = mn, mx
        new_acc.append(a)
        return len(new_acc) - 1

    tri_before = tri_after = 0
    for (p, pos, nrm, uv, idx), m in zip(prims, cellof):
        remap, P, N, U = {}, array("f"), array("f"), array("f")
        out_idx = array("I")
        for t in range(0, len(idx) - 2, 3):
            ks = (m[idx[t]], m[idx[t + 1]], m[idx[t + 2]])
            tri_before += 1
            if ks[0] == ks[1] or ks[1] == ks[2] or ks[0] == ks[2]:
                continue
            for k in ks:
                i = remap.get(k)
                if i is None:
                    e = acc[k]; n = e[6]
                    i = remap[k] = len(P) // 3
                    P.extend((e[0] / n, e[1] / n, e[2] / n))
                    L = (e[3] ** 2 + e[4] ** 2 + e[5] ** 2) ** 0.5 or 1.0
                    N.extend((e[3] / L, e[4] / L, e[5] / L))
                    U.extend((e[7], e[8]))
                out_idx.append(i)
            tri_after += 1
        mn = [min(P[k::3]) for k in range(3)] if P else [0, 0, 0]
        mx = [max(P[k::3]) for k in range(3)] if P else [0, 0, 0]
        at = {"POSITION": add(P.tobytes(), 34962, len(P) // 3, "VEC3", 5126, mn, mx)}
        if nrm is not None:
            at["NORMAL"] = add(N.tobytes(), 34962, len(N) // 3, "VEC3", 5126)
        if uv is not None:
            at["TEXCOORD_0"] = add(U.tobytes(), 34962, len(U) // 2, "VEC2", 5126)
        p["attributes"] = at
        p["indices"] = add(out_idx.tobytes(), 34963, len(out_idx), "SCALAR", 5125)
    g["accessors"], g["bufferViews"] = new_acc, new_views
    g["buffers"][0]["byteLength"] = len(out_buf)
    (gp.parent / g["buffers"][0]["uri"]).write_bytes(bytes(out_buf))
    gp.write_text(json.dumps(g), encoding="utf-8")
    print(f"triangles {tri_before:,} -> {tri_after:,}; buffer {len(out_buf) / 1e6:.1f} MB")


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 260)
