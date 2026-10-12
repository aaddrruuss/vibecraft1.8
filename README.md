# Vibecraft 1.8

Clon de Minecraft 1.8 hecho desde cero: JavaScript + WebGL2, sin dependencias ni assets externos
(todas las texturas se pintan por código al arrancar).

## Cómo jugar

Abre `index.html` en Chrome/Edge/Firefox (doble clic vale). Si el navegador da problemas con `file://`:

```
python serve.py
```

y abre <http://localhost:8000>. (`serve.py` es como `python -m http.server 8000` pero sin caché,
así el navegador siempre carga la última versión de los `.js`.)

## Controles

Todos se pueden cambiar en **Opciones → Controles...** (teclas o botones del ratón; en rojo las repetidas).
En Opciones también: volumen e invertir ratón.

| Tecla | Acción |
|---|---|
| WASD | Moverse |
| Ratón | Mirar |
| Espacio | Saltar / nadar / subir volando |
| Espacio x2 | Activar/desactivar vuelo (creativo) |
| Shift | Agacharse (no caes por bordes) / bajar volando |
| Ctrl o W x2 | Correr |
| Clic izquierdo | Romper bloque (mantener en supervivencia) / atacar |
| Clic derecho | Colocar bloque / comer / tensar arco / usar cubo / abrir mesa u horno |
| Clic central | Coger el bloque apuntado |
| 1-9 / rueda | Elegir casilla |
| E | Inventario (crafteo 2x2) |
| Q / Ctrl+Q | Tirar uno / tirar el stack |
| T / Enter | Abrir chat |
| / | Abrir chat con comando |
| F5 | Cambiar perspectiva (primera persona / tercera detrás / tercera delante) |
| F3 | Pantalla de depuración |
| F1 | Ocultar HUD |
| Esc | Pausa |

## Contenido de la 1.8

Usa los IDs reales de Minecraft 1.8 (`/give minecraft:stone 64`, `/give 35:14`, `/setblock ~ ~ ~ wool:4`).
El inventario creativo tiene las pestañas de MC (construcción, decoración, redstone, transporte, varios, comida,
herramientas, combate, pociones, materiales y buscador) con ~280 bloques y ~215 objetos.

**Funcionan:**
- Formas: losas (y dobles), escaleras, vallas, puertas de valla, muros, paneles, barrotes, puertas, trampillas, camas,
  alfombras, capas de nieve, placas, botones, palancas, antorchas, escaleras de mano, enredaderas, raíles, tartas, cofres,
  yunques, tolvas, calderos, macetas, cabezas, nenúfares, cactus. Colisiones reales y subida automática de escalones.
- Luz de bloques: antorchas, piedra luminosa, lava, calabazas iluminadas, linternas de mar, faros, fuego…
- Camas: dormir de noche pasa al día y fija el punto de reaparición (no con monstruos cerca).
- Cofres, cofres trampa, cofre de Ender (compartido), dispensadores, soltadores y tolvas como almacenamiento.
- Puertas, trampillas y puertas de valla se abren; las de hierro no (necesitan redstone).
- TNT (mechero o carga ígnea; explota en cadena), fuego que se propaga a la madera, lava que fluye y quema;
  agua + lava = obsidiana / roca / piedra.
- Arena y grava caen. Plantas, antorchas, puertas… se rompen si quitas el bloque que las sostiene.
- Agricultura: azada, semillas de trigo, zanahorias, patatas, verruga del Nether, polvo de hueso, brotes que crecen en
  árboles, cañas de azúcar y cactus que crecen.
- Armaduras de cuero, malla, hierro, oro y diamante (reducen el daño y se gastan). Herramientas de oro y azadas.
- Toda la comida (estofados devuelven el cuenco, leche quita el fuego, manzana dorada cura), pociones de agua.
- Tintes, lana/cristal/arcilla/alfombras de 16 colores, ovejas (esquilar, teñir, comen hierba) y gallinas (huevos).
- Huevos de generación, bolas de nieve, huevos (pueden salir pollitos), perlas de Ender (teletransporte).
- Élitros (pestaña de combate del creativo): ponlos en el hueco de la pechera y pulsa saltar en el aire para planear;
  gastan 1 de durabilidad por segundo. Los cohetes se lanzan sobre un bloque (estela, destello y explosión de colores)
  y, usados mientras planeas, te impulsan.
- Bloque musical (25 notas, instrumento según el bloque de debajo) y tocadiscos con los 12 discos (melodías generadas).
- ~340 recetas de la 1.8 y horno con sus fundiciones (también carbón vegetal, ladrillos, cristal, arcilla…).

**Están pero son decorativos** (se colocan/guardan, sin su función):
redstone (polvo, repetidores, comparadores, pistones, lámparas, sensores…), vagonetas, botes, monturas, mapas, brújula y
reloj animados, caña de pescar, encantamientos, pociones con efectos, soporte de pociones, faro, cuadros, marcos,
soportes de armadura, carteles (sin texto), correas y etiquetas.

## Minijuegos

Menú principal → **Minijuegos...**. Cada minijuego tiene su propia partida guardada (no toca tu mundo normal) y
se puede jugar online igual que un mundo normal (Esc → Abrir sala online).

- **Skyblock:** una isla flotante en forma de L con un árbol y un cofre (cuerda, cubo de lava, hielo, hueso,
  caña de azúcar, champiñones, semillas de calabaza, rodaja de sandía y un cactus). A 60 bloques al este hay una
  isla de arena con un cactus y otro cofre (obsidiana, semillas de sandía y arena). Todo lo demás es vacío.
  El Nether es el normal.
- **Construcción:** llanura infinita para construir y editar al estilo battle royale (siempre de día, sin monstruos).
  - Piezas en una rejilla propia de 5×4 bloques: **muro (Z)**, **suelo (X)**, **rampa (C)** y **cono (V)**.
    Clic izquierdo coloca (con *construcción turbo* basta con mantenerlo), clic derecho o **B** cambia de material
    (madera 150 PV, piedra 300, metal 500; las piezas nacen con poca vida y se "llenan" mientras se construyen),
    **R** rota la rampa, **1-9** o la rueda vuelven al pico.
  - **Editar (G):** cuadrícula 3×3 en muros (puertas, ventanas, arcos…) y 2×2 en suelos, conos (levantar esquinas)
    y rampas (arrastra de una casilla a otra para girarla). Con *editar al soltar* se confirma al soltar G; si no,
    pulsando G otra vez. Clic derecho en edición = restablecer. Solo puedes editar tus propias piezas.
  - El pico (clic sin estar construyendo) rompe piezas; flechas y explosiones también las dañan. Lo que queda sin
    apoyo se derrumba. Online, todos ven y rompen las construcciones de todos.
  - Opciones → *Editar al soltar* / *Construcción turbo*. Teclas en Opciones → Controles.
  - Puedes cambiar el aspecto con un paquete de texturas: `textures/blocks/build_wood.png`, `build_wood_frame`,
    `build_stone`, `build_stone_frame`, `build_metal`, `build_metal_frame`.

## Multijugador online (P2P)

No hace falta subir el juego a ninguna web: cada jugador abre su copia de `index.html` (doble clic o
`python serve.py`) y se conectan directamente entre sus PCs.

- **Anfitrión:** entra en su mundo → Esc → **Abrir sala online**. Aparece un código de 6 letras (clic para copiarlo).
- **Invitados:** menú principal → **Unirse a una sala...** → nombre + código → Conectar.

El anfitrión guarda el mundo y lo simula para todos (mobs, agua, cultivos, hornos, objetos tirados); los
invitados ven y editan el mismo mundo, pelean contra los mismos mobs, comparten cofres, chat y hora del día.
El inventario y la posición de cada invitado se guardan en el mundo del anfitrión por su nombre. El nombre se
cambia en Opciones. Cada jugador ve la skin de los demás si la eligió en Opciones.

Cómo funciona: la conexión inicial se acuerda a través del servidor público y gratuito de PeerJS
(`0.peerjs.com`) y servidores STUN de Google/Cloudflare; después todo el tráfico va directo entre los PCs
(WebRTC). Se necesita internet y un navegador reciente. Notas:
- El anfitrión debe tener el juego abierto (puede estar en otra pestaña o minimizado; si lo cierra, la sala se acaba).
- En algunas redes (algunas universidades/empresas, 4G con CGNAT estricto) la conexión directa no es posible.
- Todos deben usar la misma versión del juego. Los demás jugadores ven tu IP, como en cualquier conexión P2P.
- Si un invitado está en otra dimensión que el anfitrión, sus mobs los simula su propio PC.
- No se sincronizan: dormir para saltar la noche (solo el anfitrión), tocadiscos/bloques musicales, ni el cofre de Ender
  (es de cada jugador).

## Paquetes de texturas

**Opciones → Paquetes de texturas... → Añadir paquete...** y elige el `.zip` de un paquete de recursos de
**Minecraft 1.8** tal cual (sin descomprimir). Se guarda en el navegador; haz clic en uno para activarlo o en
"Por defecto" para volver a las texturas de Vibecraft.

Se usan: bloques, objetos, mobs (zombi, esqueleto, creeper, araña, cerdo, vaca, oveja, gallina, hombre-cerdo,
ghast, Steve), armaduras puestas, cofres, cabezas, corazones/comida/armadura del HUD y algunas partículas.
Admite paquetes HD (32x, 64x; los de más resolución se reducen a 64x). Las texturas en gris de MC (hierba, hojas,
lianas…) se tiñen con el color de las llanuras (o el `colormap` del paquete). Lo que el paquete no traiga se queda
con la textura del juego. Paquetes de versiones más nuevas cargan, pero pueden faltar texturas renombradas.

## Skin personalizada

Deja tu skin (PNG estándar de 64x64 o 64x32) como `skin/skin.png`. Funciona si abres el juego con un servidor local.
Si lo abres con doble clic, ve a **Opciones → Elegir skin...** y elige el PNG (queda guardado en el navegador).
Se ve en tercera persona (F5) y en la mano.

## Qué incluye

- Mundo infinito por chunks (16x256x16, se construye hasta y 255) con semilla: llanuras, bosque, desierto, tundra, colinas extremas, océano, playa.
- Cuevas, menas (carbón, hierro, oro, diamante), grava, piedra base, árboles, flores, hierba alta, cactus.
- Luz del cielo con propagación, oclusión ambiental e iluminación suave.
- Ciclo día/noche de 20 minutos, sol, luna, estrellas, nubes, niebla, niebla submarina.
- Física: gravedad, colisiones, salto, nado, vuelo, sprint, agacharse.
- **Supervivencia**: vida, hambre y saturación, aire bajo el agua, daño por caída, muerte (sueltas el inventario) y reaparición.
- Romper bloques según dureza y herramienta, con grietas; picos de distinto nivel para cada mena.
- Inventario de 36 casillas, crafteo 2x2 y mesa de trabajo 3x3, horno (fundir hierro/oro, cocinar carne, cristal, piedra).
- Herramientas de madera, piedra, hierro y diamante (pico, hacha, pala, espada) con durabilidad; arco y flechas; cubo.
- **Mobs**: zombi y esqueleto (arden al sol; el esqueleto dispara), creeper (explota y rompe bloques), araña (trepa, neutral de día), cerdo y vaca (comida).
- **Agua con físicas**: fluye 7 bloques, cae en cascada, fuentes infinitas (2 fuentes forman otra) y la corriente te arrastra.
- Modo creativo (paleta con todos los objetos). Se elige al crear el mundo y se cambia en el menú de pausa.
- Guardado automático en `localStorage` (cada 30 s, al pausar y al salir): bloques, inventario, hornos, vida y hambre.

## Atajos del inventario (como en MC)

| Gesto | Efecto |
|---|---|
| Clic izquierdo | Coger / dejar / intercambiar stack |
| Clic derecho | Coger la mitad / dejar uno |
| Mantener clic izquierdo y pasar por casillas | Reparte el stack a partes iguales |
| Mantener clic derecho y pasar por casillas | Deja uno en cada casilla |
| Doble clic con un stack en la mano | Junta todos los objetos iguales |
| Mayús + clic | Mover entre inventario y barra rápida (o al horno) |
| Mayús + doble clic | Mover todos los objetos de ese tipo |
| 1-9 sobre una casilla | Intercambiar con esa casilla de la barra rápida |
| Q / Ctrl+Q sobre una casilla | Tirar uno / tirar el stack |
| Clic central (creativo) | Coger un stack completo |
| Pasar el ratón por encima | Muestra el nombre del objeto (y daño, armadura, durabilidad…) |
| Clic fuera del panel | Tirar lo que llevas en la mano |

## Sonidos

Sintetizados en tiempo real con WebAudio (los originales de Mojang tienen copyright): pasos y roturas según el material
(hierba, tierra, arena, piedra, madera, cristal, nieve), golpes al picar, daño, gruñidos de zombi, huesos de esqueleto,
siseo y explosión del creeper, araña, cerdo, vaca, arco, flecha, comer, eructo, recoger objetos, chapoteo y clics de menú.
Son posicionales: bajan con la distancia y suenan a izquierda o derecha.

## Animales y reproducción

- Cerdos con zanahoria o patata, vacas y ovejas con trigo, gallinas con semillas.
- Clic derecho con su comida → modo amor (corazones). Dos de la misma especie se buscan y nace una cría.
- Las crías siguen a los adultos y crecen en 20 minutos (darles comida acelera el crecimiento). Los padres esperan 5 minutos para volver a criar.
- Si llevas su comida en la mano, te siguen.

## El Nether

- Construye un marco de obsidiana (interior mínimo 2x3, hasta 21x21) y enciéndelo con mechero o carga ígnea.
- Quédate 4 segundos dentro del portal (1 en creativo/espectador). 1 bloque en el Nether = 8 en el mundo normal;
  al otro lado se reutiliza un portal cercano (hasta 128 bloques) o se construye uno nuevo.
- Generación propia: cavernas de piedra infernal, mar de lava (y ≤ 31), piedra base arriba y abajo, piedra luminosa,
  mena de cuarzo, arena de almas, grava, fuego y champiñones. Sin cielo ni ciclo día/noche, niebla roja.
- Hombres-cerdo zombi: neutrales; si pegas a uno, se enfadan todos los cercanos. Sueltan carne podrida y pepitas de oro.
- Ghasts: vuelan y lanzan bolas de fuego que explotan y prenden fuego. Sueltan pólvora y lágrimas de ghast.
- El agua se evapora, la lava corre más lejos y dormir en una cama la hace explotar.
- Si mueres en el Nether reapareces en tu punto del mundo normal.
- Aún no: fortalezas, blazes, cubos de magma, esqueletos wither.

## Modo espectador

Se activa con `/gamemode spectator` (o `sp`, `3`), con el botón de modo del menú de pausa o al crear el mundo.
Vuelas atravesando bloques, nada te hace daño, los mobs no te ven y no puedes romper, colocar ni coger objetos.
La rueda del ratón cambia la velocidad de vuelo. Clic izquierdo sobre un mob para ver desde sus ojos; Mayús para salir.

## Chat y comandos

En el chat: Tab autocompleta, ↑/↓ recorre el historial. Las coordenadas admiten `~` (relativas).

| Comando | Qué hace |
|---|---|
| `/help [comando]` | Lista de comandos |
| `/gamemode <survival\|creative\|spectator\|0\|1\|3>` | Cambia el modo |
| `/time set <day\|noon\|night\|midnight\|n>` · `/time add n` · `/time query daytime` | Hora |
| `/tp <x> <y> <z> [yaw] [pitch]` | Teletransporte |
| `/give [@p] <objeto> [cantidad]` | Da objetos (`diamond_pickaxe`, `minecraft:stone`, `cooked_beef`…) |
| `/summon <zombie\|skeleton\|creeper\|spider\|pig\|cow> [x y z]` | Invoca un mob |
| `/kill [@p\|@e\|@e[type=zombie]]` | Mata entidades (sin argumento: a ti) |
| `/clear [objeto]` | Vacía el inventario |
| `/setblock x y z <bloque>` · `/fill x1 y1 z1 x2 y2 z2 <bloque> [replace <bloque>]` | Edita bloques (máx. 32768) |
| `/gamerule <doDaylightCycle\|doMobSpawning\|keepInventory\|mobGriefing> <true\|false>` | Reglas |
| `/difficulty <peaceful\|easy\|normal\|hard>` | Dificultad (pacífico: sin hostiles ni hambre) |
| `/spawnpoint [x y z]` · `/setworldspawn` · `/seed` | Reaparición y semilla |
| `/say`, `/me`, `/weather`, `/heal` | Mensajes, clima (no hay lluvia), curación (extra) |

Los mensajes de muerte aparecen en el chat ("Jugador cayó desde muy alto", "fue asesinado por Zombi"…).

## Recetas

| Resultado | Receta |
|---|---|
| 4 tablas | 1 tronco |
| 4 palos | 2 tablas en vertical |
| Mesa de trabajo | 2x2 tablas |
| Horno | 8 rocas en anillo |
| Pico / hacha / pala / espada | patrón clásico de MC con tablas, roca, lingote de hierro o diamante + palos |
| Arco | 3 palos + 3 cuerdas |
| 4 flechas | grava + palo + hueso (en columna, receta inventada: no hay pedernal ni plumas) |
| Cubo | 3 lingotes de hierro en V |
| Ladrillos de piedra / arenisca | 2x2 piedra / 2x2 arena |

## No incluye (aún)

Experiencia, armaduras, camas, más mobs, redstone, luz de antorchas, lava, Nether/End, multijugador.
Los mobs no se guardan al salir.

## Estructura

```
js/math.js       matrices, frustum
js/sound.js      efectos de sonido sintetizados
js/noise.js      ruido Perlin con semilla
js/blocks.js     registro de bloques 1.8 (estados id<<4|meta)
js/shapes.js     formas, colisiones y colocación de bloques no cúbicos
js/itemart.js    sprites de objetos e iconos del HUD
js/textures.js   texturas procedurales + iconos
js/generator.js  generación de terreno
js/nether.js     generación del Nether y portales
js/world.js      chunks, luz, raycast, ediciones
js/mesher.js     geometría de chunks (AO + luz suave)
js/renderer.js   WebGL2: chunks, agua, cielo, nubes
js/items.js      objetos, herramientas, sprites e iconos del HUD
js/inventory.js  inventario, recetas, horno
js/entity.js     física base de entidades
js/player.js     jugador: movimiento, vida, hambre, aire
js/mobs.js       IA de mobs, flechas, objetos tirados, aparición
js/models.js     modelos de cajas, texturas de mobs, mano
js/ui.js         pantallas de inventario/crafteo/horno
js/chat.js       chat y comandos
js/main.js       bucle, UI, entrada, guardado
```

Consola: `VC.debug.player`, `VC.debug.setTime(18000)`, `VC.debug.spawn('creeper')`, `VC.debug.give(VC.I.DIAMOND_PICK)`.
