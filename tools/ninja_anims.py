"""2.31.0 忍びの任務の動き：assets/anims_src/*.fbx（Mixamo、Without Skin・30fps）を1つの glb（assets/models/ninja_anims.glb）にまとめる。
Blender で動かす： blender -b --python tools/ninja_anims.py
・最初のファイルの骨を土台にし、ほかのファイルの動きをその骨の NLA の段に1つずつ載せる（段の名前＝動きの名前＝ファイル名を小文字にしたもの）
・体の移動（登りの上がり・泳ぎの前進）はゲームの側で消す（ninja3d.js）
"""
import bpy, os, glob
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'anims_src')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'models', 'ninja_anims.glb')
files = sorted(glob.glob(os.path.join(SRC, '*.fbx')))
bpy.ops.wm.read_factory_settings(use_empty=True)
base = None
for f in files:
    name = os.path.splitext(os.path.basename(f))[0].lower()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    arm = [o for o in new if o.type == 'ARMATURE'][0]
    act = arm.animation_data.action
    act.name = name; act.use_fake_user = True
    slot = arm.animation_data.action_slot if hasattr(arm.animation_data, 'action_slot') else None
    if base is None:
        base = arm; base.name = 'Armature'; base.animation_data.action = None
    else:
        arm.animation_data.action = None
        for o in new: bpy.data.objects.remove(o, do_unlink=True)
    tr = base.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(act.frame_range[0]), act)
    if slot is not None and hasattr(st, 'action_slot'):
        try: st.action_slot = slot
        except Exception as e: print('slot', name, e)
    print('ADDED', name, act.frame_range[:])
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_optimize_animation_size=False, export_skins=True, export_yup=True)
print('SAVED', OUT)
