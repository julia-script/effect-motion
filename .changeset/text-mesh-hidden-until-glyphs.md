---
"@effect-motion/renderer": patch
---

Text meshes stay hidden until their glyph attributes land. The SDF material references the instanced `glyphBounds`/`glyphUvRect` attributes, but those are only installed after async typesetting and layout resolve. Frames rendered in between drew the mesh with `instanceCount` 0 while the shader still looked for attributes the geometry did not have, so three logged "AttributeNode: Vertex attribute not found on geometry" every frame until layout landed. Visibility is now gated on the attributes being present — mirroring what the image renderer already does with its decode — with the caller's intent recorded and applied once the buffers are installed.
