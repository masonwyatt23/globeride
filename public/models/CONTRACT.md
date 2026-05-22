# GlobeRide Avatar glTF Contract

## Files

| File | Description | Size |
|------|-------------|------|
| `cyclist-road.glb` | Road bike + rider (drop bars, aggressive lean) | ~137 KB |
| `cyclist-gravel.glb` | Gravel bike + rider (flat bars, relaxed position) | ~134 KB |
| `cyclist-tt.glb` | Time-trial bike + rider (aero bars, full tuck) | ~136 KB |

All files are valid glTF 2.0 binary (.glb) with a 12-byte header, one JSON chunk, and one BIN chunk.

## Coordinate System

- **Units:** meters
- **Up axis:** +Y
- **Forward / travel direction:** +X
- **Origin:** ground-contact midpoint between the two wheel contact patches (directly below the bottom bracket, at Y = 0)
- The bottom bracket sits at Y = `WHEEL_RADIUS − bbDrop` ≈ 0.27–0.29 m above ground

## Overall Proportions

| Dimension | Value |
|-----------|-------|
| Wheelbase | 1.00 m |
| Wheel radius | 0.34 m |
| Wheel tube radius | 0.022 m |
| Rider height (standing) | 1.75 m |
| Total model height | ~1.85 m |

## Named Nodes (exact names, case-sensitive)

The integration agent rotates/animates these nodes by name. Every node's `translation` in the glTF places its **origin at its rotation pivot**.

| Node name | Rotation axis | Pivot location | Notes |
|-----------|---------------|----------------|-------|
| `wheelFront` | Y axis (spin) | Front wheel axle centre | Torus mesh in XZ plane; rotate around Y to roll |
| `wheelRear` | Y axis (spin) | Rear wheel axle centre | Same mesh as wheelFront, different node |
| `crank` | Z axis (pedal stroke) | Bottom bracket centre | Rotate around Z for cadence animation |
| `thighL` | Z axis | Left hip joint | Mesh geometry starts at hip, ends at knee |
| `shinL` | Z axis | Left knee joint | Mesh geometry starts at knee, ends at ankle |
| `thighR` | Z axis | Right hip joint | Mesh geometry starts at hip, ends at knee |
| `shinR` | Z axis | Right knee joint | Mesh geometry starts at knee, ends at ankle |

Additional non-animated nodes (informational):
- `frame` — complete bike frameset, fork, saddle, handlebars
- `riderBody` — torso, head, helmet, arms, hands, shoes (everything except legs)
- `cyclist-{road|gravel|tt}` — root node containing all of the above as children

## Named Materials (exact names, case-sensitive)

The integration agent recolours these materials at runtime by name.

| Material name | Default colour (hex approx.) | Metallic | Roughness | Usage |
|---------------|------------------------------|----------|-----------|-------|
| `frame` | `#1E2429` dark carbon | 0.70 | 0.30 | Bike frame tubes, fork, stem |
| `wheel` | `#141416` near-black | 0.40 | 0.60 | Rim, tire, spokes, hub |
| `kit` | `#B8141A` team red | 0.00 | 0.85 | Rider jersey + bib shorts |
| `skin` | `#DEB085` warm tan | 0.00 | 0.90 | Face, neck, hands |
| `helmet` | `#EBEBF0` white | 0.05 | 0.50 | Cycling helmet shell |
| `accent` | `#0D62B8` blue | 0.20 | 0.55 | Saddle, pedals, crank arms, shoes |

## Mesh Structure

Each glTF Mesh has one or more primitives. All primitives carry:
- `POSITION` (VEC3, FLOAT, with min/max)
- `NORMAL` (VEC3, FLOAT)
- `TEXCOORD_0` (VEC2, FLOAT)
- Indices (UNSIGNED_SHORT when vertCount ≤ 65535, else UNSIGNED_INT)

## Animation Pivot Details

### Wheels
Each wheel node's `translation` is set to the axle centre. The wheel mesh (a torus) is built centred at origin in the XZ plane. Spin animation: rotate the node around its local Y axis.

```
wheelFront.rotation = quaternionFromAxisAngle([0,1,0], totalAngle)
wheelRear.rotation  = quaternionFromAxisAngle([0,1,0], totalAngle)
```

### Crank
The crank node's `translation` is at BB centre. Crank arms are in the XZ plane (BB-local space). Rotate around local Z for cadence:

```
crank.rotation = quaternionFromAxisAngle([0,0,1], crankAngle)
```

### Legs
Thigh pivot = hip joint. Shin pivot = knee joint. Both rotate around the local Z axis (lateral axis of bike). The mesh geometry of each segment starts at the pivot and extends toward the next joint — so applying a rotation to `thighL` swings both thigh and (if parented) shin together; apply additional rotation to `shinL` for knee flex.

Note: in the current static .glb the leg nodes are **siblings** (not parent–child). The integration layer should maintain a logical parent–child relationship in its scene graph if it wants hierarchical leg animation, or drive each node's world-space rotation independently using forward kinematics.

## Generator

Source: `scripts/gen-avatar-gltf.ts`
Run: `node_modules/.bin/vite-node scripts/gen-avatar-gltf.ts`
Regenerates all three .glb files into `public/models/`.
