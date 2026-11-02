# Fronteras del Reino

Tower defense de fusión con un mapa que se genera solo y crece tras cada oleada. Usa las tropas, monstruos, jefes, comandantes, losetas y efectos de [Reino de Torres](https://adrianezd.github.io/reino-de-torres/).

**Jugar:** https://adrianezd.github.io/fronteras-del-reino/

## Cómo se juega

- El castillo está en el centro. Los monstruos salen de los portales y siguen el camino hasta él.
- **Invocar** pone una tropa al azar de tu mazo en una losa. Si antes tocas una losa libre, va ahí; si no, a la que más camino cubre. Cuesta 10 de maná más 8 por cada tropa que ya tengas.
- **Fusionar**: arrastra una tropa sobre otra igual del mismo rango (o tócalas una tras otra). Sube un rango. Eco se fusiona con cualquiera.
- Cada tropa tiene su **alcance** en casillas (Halcón llega muy lejos, Sombra muy poco). Garra suelta lobos desde el castillo que recorren un camino entero.
- **El mapa crece** tras cada oleada: la punta más corta se alarga 3 casillas (2 desde la oleada 20) y salen losas nuevas a los lados. En las expansiones de `FORK_AT` (`js/map.js`) se abre un **camino nuevo** con su portal. Si el camino pasa por una losa ocupada, la tropa se mueve a la losa libre más cercana.
- **Zonas**: prado, glaciar, volcán, pantano y ruinas, cada una con sus losas. Las tropas de su elemento pegan un 20% más encima (`BIOMES` en `js/data.js`).
- **Casillas especiales** que salen a veces: Altar (+35% de daño), Atalaya (+30% de velocidad), Diana (+50% de alcance) y Fuente (maná cada 8 s).
- Cartas de abajo: mejoras de partida por tropa (5 niveles). Comandante con habilidad que se carga. Bendición cada 5 oleadas y jefe cada 10.
- Arrastrar el mapa lo mueve; pellizcar o la rueda acercan. La diana vuelve a encuadrarlo todo.

## Modos

- **Expedición**: mapa nuevo cada vez, con récord.
- **Mapa del día**: mapa, mazo y comandante iguales para todos ese día.
- **Mapa por código**: cada mapa tiene un código de 5 cifras (sale en la pausa, al acabar y en Récords) para repetirlo.

La partida se guarda al acabar cada oleada. Para retomarla se vuelve a generar el mapa con la semilla y el número de expansiones (`snapshot` y `restore` en `js/game.js`); por eso el mapa solo usa su propio generador aleatorio.

## Estructura

Sin build. `index.html` carga `js/data.js` (tropas, monstruos, zonas, casillas, comandantes y bendiciones), `js/map.js` (generación del mapa por casillas y su dibujo en un lienzo aparte, con la niebla), `js/game.js` (motor, cámara y dibujo) y `js/ui.js` (pantallas, controles, sonido y guardado). El motor sale del de Asedio. Al tocar un css o js, sube su `?v=` en `index.html` y `APP_VERSION` y `APP_NOTES` en `js/data.js`.
