# 忍びの任務で使う Mixamo の動き（落としてもらう一覧）

いまの忍びの任務（js/ninja3d.js）は、しゃがむ・登る・担ぐ・泳ぐなどを骨を手で曲げて作っている。
ここに挙げた動きを Mixamo（https://www.mixamo.com/ 、Adobe のアカウントで無料）から落とせば、本物の動きに差しかえる。

## 落とし方（どの動きも同じ）

1. キャラクターは何でもよい（最初の Y Bot のままで大丈夫）。骨の名前がそろっているので、こちらの兵のモデルにそのまま使える
2. 動きを選んだら、右の **In Place** にチェックがある動きはチェックを入れる（その場で動く形にする）
3. **DOWNLOAD** を押して、次の設定で落とす
   - Format：**FBX Binary (.fbx)**
   - Skin：**Without Skin**
   - Frames per second：**30**
   - Keyframe Reduction：**none**
4. 落としたファイルの名前を、下の表の「ファイル名」に変えて、
   `C:\Users\maild\Documents\sengoku\assets\anims_src\` に入れる（このフォルダはもう作ってある）

Mixamo の検索は英語。下の「探す言葉」で検索し、出てきた中から説明に合うものを選ぶ（同じ名前でもいくつか出るので、見た目で選んでよい）。

## 必ずほしいもの（10）

| ファイル名 | 使う所 | 探す言葉 | 選ぶ目安 |
|---|---|---|---|
| crouch_idle.fbx | しゃがんで止まっている | crouch idle | 低くしゃがんで、じっと構えている |
| crouch_walk.fbx | しゃがみ歩き（忍び足） | crouched walking / sneak | 腰を落としてそろそろ前へ歩く。In Place |
| climb_wall.fbx | 石垣・塀をよじ登る | climbing | 壁に張りついて手足で上へ登る（繰り返せる動き） |
| climb_top.fbx | 登りきって上に乗る | climbing to top | 壁の上のふちに手をかけて体を引き上げる |
| climb_ladder.fbx | 梯子を登る | climbing ladder | 梯子を手足で交互に登る |
| stab.fbx | 後ろから暗殺 | stabbing | 片手の刃物で前へ突き刺す。短いもの |
| knockout.fbx | 後ろから当て身 | punch | 前の相手を打つ（肘打ち・拳でもよい）。短いもの |
| swim.fbx | 堀を泳ぐ | swimming | 平泳ぎか、ゆっくりした泳ぎ。In Place |
| throw.fbx | 吹き矢・煙玉・撒菱 | throw | 片手で前へ投げる。短いもの |
| work.fbx | 工作（火を付ける・細工・盗む） | kneeling / pick up | ひざをついて手元で何かをいじる |

## あればうれしいもの（8）

| ファイル名 | 使う所 | 探す言葉 | 選ぶ目安 |
|---|---|---|---|
| carry_pickup.fbx | 倒れた見張りを担ぎ上げる | picking up | 床の物を持ち上げる |
| carry_walk.fbx | 担いで歩く | carry / carrying | 重い物を肩や腕に抱えて歩く。In Place |
| victim_stab.fbx | 暗殺された見張りが崩れる | stabbed / dying | 刺されて前か横へ崩れ落ちる |
| victim_ko.fbx | 当て身で気を失う | knocked out | 打たれて気を失い、倒れる |
| look_around.fbx | 見張りが辺りを見回す（？の時） | looking around | 立ったまま左右を見回す |
| sleeping.fbx | 寝所で寝ている武将 | sleeping | 横になって寝ている |
| talking.fbx | 町人に噂を流す | talking | 立ち話の身ぶり |
| hard_landing.fbx | 高い所から飛び降りた着地 | landing | しゃがむように着地する |

## 落としたあと（こちらでやること）

- Blender（入っている 5.3）で FBX を読み、soldier_anims.glb と同じ骨の名前・大きさにそろえて、忍び用の動きのファイルにまとめる
- ninja3d.js の手で曲げている所（しゃがむ・登る・担ぐ・泳ぐ・投げる・工作）を、この動きに差しかえる
- 足りない動きは、これまでの手で曲げた形のまま使う
