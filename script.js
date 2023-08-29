const RADIUS = 10;
const NODE_BASE_COLOR = [90, 90, 90];
const LINK_BASE_COLOR = [230, 230, 230];
const ACTIVE_COLOR_1 = [255, 64, 129];
const ACTIVE_COLOR_2 = [33, 150, 243];
const ACTIVE_COLOR_3 = [105, 240, 174];

function trainMarkovChain(data, noteGroup, nextNoteGroup) {
  let left = { notes: noteGroup.notes, duration: noteGroup.duration };
  let right = {
    notes: nextNoteGroup.notes,
    duration: nextNoteGroup.duration };

  let mappings = data.get(left) || new buckets.Dictionary(JSON.stringify);
  let count = mappings.get(right) || 0;
  mappings.set(right, count + 1);
  data.set(left, mappings);
}

function predictUsingMarkovChain(current, data) {
  const options = data.get(current);
  if (options) {
    const nexts = options.keys();
    const r = Math.random();
    const totalWeight = nexts.reduce(
    (s, nextKey) => s + options.get(nextKey),
    0);

    let cumulativeWeight = 0;
    for (const nextKey of nexts) {
      cumulativeWeight += options.get(nextKey);
      if (cumulativeWeight > r * totalWeight) {
        return nextKey;
      }
    }
    throw 'Oh no';
  } else {
    const all = data.keys();
    return all[Math.floor(Math.random() * all.length)];
  }
}

function processMidi(midi) {
  const notes = midi.tracks[0].notes;
  const succession = [];
  for (const note of notes) {
    if (
    succession.length &&
    succession[succession.length - 1].time === note.time)
    {
      succession[succession.length - 1].notes.push(note.midi);
    } else {
      succession.push({
        time: note.time,
        notes: [note.midi],
        velocity: note.velocity });

      if (succession.length > 1) {
        const last = succession[succession.length - 2];
        const cur = succession[succession.length - 1];
        last.duration = cur.time - last.time;
      }
    }
  }
  return succession;
}

let linkCount = 0;
function updateGraphData(graphData, markovChain, linkPrefix) {
  markovChain.keys().forEach(node => {
    const connections = markovChain.get(node);
    const nodeKey = JSON.stringify(node);
    const from = graphData.nodes[nodeKey];
    connections.keys().forEach(toNode => {
      const weight = connections.get(toNode);
      const toNodeKey = JSON.stringify(toNode);
      const to = graphData.nodes[toNodeKey];
      const link = graphData.links[nodeKey + toNodeKey] = graphData.links[
      nodeKey + toNodeKey] ||
      {
        id: linkPrefix + linkCount++,
        source: from,
        target: to,
        recency: 0 };

      link.value = weight;
    });
  });
}

function makeD3Graph(element, svg, defs, centerX, pairCenterX, centerY) {
  const simulation = d3.
  forceSimulation().
  velocityDecay(0.9).
  force('link', d3.forceLink()).
  force('collide', d3.forceCollide(50).strength(0.8)).
  force('charge', d3.forceManyBody()).
  force('y', d3.forceY(centerY)).
  force('x', d3.forceX(centerX)).
  force('pairX', d3.forceX(pairCenterX).strength(0.001)).
  alphaTarget(1);
  const links = svg.append('g').attr('class', 'links');
  const arrows = defs.append('g');
  const nodes = svg.append('g').attr('class', 'nodes');
  return { simulation, links, arrows, nodes };
}

function renderD3Graph(
{ simulation, links, arrows, nodes },
graphData,
activeColor)
{
  const linkPaths = links.selectAll('path').data(d3.values(graphData.links));
  const linkPathsEnter = linkPaths.
  style('stroke', l => getColor(LINK_BASE_COLOR, activeColor, l.recency)).
  enter().
  append('path').
  attr('fill', 'none').
  attr('marker-end', l => `url(#marker-${l.id}`).
  style('stroke', l => getColor(LINK_BASE_COLOR, activeColor, l.recency));
  const linkPathsEnterUpdate = linkPathsEnter.
  merge(linkPaths).
  style('stroke', l => getColor(LINK_BASE_COLOR, activeColor, l.recency)).
  style('stroke-width', l => l.value / 4);

  const arrowMarkers = arrows.
  selectAll('marker').
  data(d3.values(graphData.links));
  const arrowMarkersEnter = arrowMarkers.
  enter().
  append('svg:marker').
  attr('id', l => `marker-${l.id}`).
  attr('viewBox', '0 -5 10 10').
  attr('refX', l => l.source === l.target ? 0 : RADIUS * 1.8).
  attr('refY', -2).
  attr('markerWidth', 10).
  attr('markerHeight', 10).
  attr('markerUnits', 'userSpaceOnUse').
  attr('orient', 'auto');
  arrowMarkersEnter.append('svg:path').attr('d', `M0,-3L10,0L0,3`);
  arrowMarkersEnter.
  merge(arrowMarkers).
  select('path').
  style('fill', l => getColor(LINK_BASE_COLOR, activeColor, l.recency));

  const nodeCircles = nodes.
  selectAll('circle').
  data(d3.values(graphData.nodes));
  const nodeCirclesEnter = nodeCircles.
  enter().
  append('circle').
  attr('r', RADIUS).
  style('stroke', '#aaa').
  call(
  d3.
  drag().
  on('start', dragstarted).
  on('drag', dragged).
  on('end', dragended));

  const nodeCirclesEnterUpdate = nodeCirclesEnter.
  merge(nodeCircles).
  style('fill', n => getColor(NODE_BASE_COLOR, activeColor, n.recency)).
  style('stroke-width', n => n.current ? 2 : 0);

  function dragstarted(d) {
    if (!d3.event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(d) {
    d.fx = d3.event.x;
    d.fy = d3.event.y;
  }

  function dragended(d) {
    if (!d3.event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  simulation.nodes(d3.values(graphData.nodes)).on('tick', () => {
    linkPathsEnterUpdate.attr('d', d => {
      var dx = d.target.x - d.source.x,
      dy = d.target.y - d.source.y,
      dr = Math.sqrt(dx * dx + dy * dy);

      if (dr === 0) {
        // Self-link
        const xRotation = 0;
        const largeArc = 1;
        const sweep = 0;
        const drx = 20;
        const dry = 20;
        const x1 = d.target.x;
        const y1 = d.target.y;
        const x2 = x1 + RADIUS;
        const y2 = y1 + RADIUS;
        return `M${x1},${y1}A${drx},${dry}, ${xRotation},${largeArc},${sweep} ${x2},${y2}`;
      } else {
        return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.
        target.y}`;
      }
    });
    nodeCirclesEnterUpdate.attr('cx', d => d.x).attr('cy', d => d.y);
  });
  simulation.
  force('link').
  distance(d => 175 - d.value * 5).
  links(d3.values(graphData.links));
  simulation.force('x').strength(d => d.recency / 2);
  simulation.force('y').strength(d => d.recency / 2);
  simulation.alpha(1).restart();
}

function mixColors(a, b, percentage) {
  let mix = [];
  mix[0] = Math.floor((1 - percentage) * a[0] + percentage * b[0]);
  mix[1] = Math.floor((1 - percentage) * a[1] + percentage * b[1]);
  mix[2] = Math.floor((1 - percentage) * a[2] + percentage * b[2]);
  return mix;
}

function getColor(baseColor, activeColor, recency) {
  const color = mixColors(baseColor, activeColor, recency);
  return `rgb(${color.join(',')}`;
}

function setCurrentAndRender(graphData, d3Graph, current, activeColor) {
  const currentKey = JSON.stringify(current);
  d3.values(graphData.links).forEach(link => {
    const current = link.target.key === currentKey && link.source.current;
    link.recency = current ? 1 : link.recency * 0.7;
  });
  d3.values(graphData.nodes).forEach(node => {
    node.current = node.key === currentKey;
    node.recency = node.key === currentKey ? 1 : node.recency * 0.7;
  });
  renderD3Graph(d3Graph, graphData, activeColor);
}

function beginSong(leftMidi, rightMidi, activeColor) {
  const leftSuccession = processMidi(leftMidi);
  const rightSuccession = processMidi(rightMidi);
  const leftMarkovChain = new buckets.Dictionary(JSON.stringify);
  const rightMarkovChain = new buckets.Dictionary(JSON.stringify);

  let stopped = false;

  const leftGraphData = { nodes: {}, links: {} };
  const rightGraphData = { nodes: {}, links: {} };
  const el = d3.select('.visualization');
  const width = el.node().getBoundingClientRect().width;
  const height = el.node().getBoundingClientRect().height;
  const svg = el.append('svg').attr('width', width).attr('height', height);
  const defs = svg.append('svg:defs');

  const leftCenterX = width / 3.5;
  const rightCenterX = width - width / 3.5;
  const centerY = height / 2;
  const leftD3Graph = makeD3Graph(
  '.left',
  svg,
  defs,
  leftCenterX,
  rightCenterX,
  centerY);

  const rightD3Graph = makeD3Graph(
  '.right',
  svg,
  defs,
  rightCenterX,
  leftCenterX,
  centerY);


  function playLoop(
  t,
  markovChain,
  graphData,
  d3Graph,
  originalPlayback,
  linkPrefix,
  centerX,
  centerY,
  last)
  {
    if (stopped) return;

    let current, velocity;
    if (originalPlayback.length) {
      const succ = originalPlayback.shift();
      current = { notes: succ.notes, duration: succ.duration };
      velocity = succ.velocity;
      graphData.nodes[JSON.stringify(current)] = graphData.nodes[
      JSON.stringify(current)] ||
      {
        key: JSON.stringify(current),
        recency: 0,
        x: centerX,
        y: centerY };

      if (last) {
        trainMarkovChain(markovChain, last, current);
      }
    } else {
      current = predictUsingMarkovChain(last, markovChain);
      velocity = 0.1;
    }
    const durationToNext =
    (current.duration || 4) * (originalPlayback.length ? 1 : 2);
    for (const note of current.notes) {
      piano.keyDown(note, velocity, t);
      piano.keyUp(note, t + durationToNext - 0.1);
    }
    Tone.Draw.schedule(() => {
      updateGraphData(graphData, markovChain, linkPrefix);
      setCurrentAndRender(graphData, d3Graph, current, activeColor);
    }, t);
    Tone.Transport.schedule(
    (t) =>
    playLoop(
    t,
    markovChain,
    graphData,
    d3Graph,
    originalPlayback,
    linkPrefix,
    centerX,
    centerY,
    current),

    '+' + durationToNext);

  }

  Tone.Transport.schedule(
  (t) =>
  playLoop(
  t,
  leftMarkovChain,
  leftGraphData,
  leftD3Graph,
  leftSuccession,
  'left',
  leftCenterX,
  centerY),

  Tone.now() + 1 + leftSuccession[0].time);

  Tone.Transport.schedule(
  (t) =>
  playLoop(
  t,
  rightMarkovChain,
  rightGraphData,
  rightD3Graph,
  rightSuccession,
  'right',
  rightCenterX,
  centerY),

  Tone.now() + 1 + rightSuccession[0].time);


  renderD3Graph(leftD3Graph, leftGraphData, activeColor);
  renderD3Graph(rightD3Graph, rightGraphData, activeColor);

  return () => {
    stopped = true;
    svg.remove();
  };
}

const compressor = new Tone.Compressor().toMaster();
// Piano assets crash mobile devices, try to pare down if detecting touch device.
const isTouch = ('ontouchstart' in window);
const pianoVelocities = isTouch ? 1 : 4;
const pianoRelease = !isTouch;
const piano = new Piano.default(
[21, 90],
pianoVelocities,
pianoRelease).
connect(compressor);

const started = new Promise(function (resolve, reject) {
  document.querySelector("#start").addEventListener('click', () => {
    document.querySelector(".starting").remove();

    let loading = document.querySelector('.loading');
    if (loading) {
      loading.classList.remove('hidden');
    }
    document.querySelector('.visualization').classList.remove('hidden');
    document.querySelector('nav').classList.remove('hidden');

    Tone.Transport.start();
    StartAudioContext(Tone.context, document.documentElement);

    resolve();
  });
});

Promise.all([
started,
piano.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/'),
new Promise(r => MidiConvert.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/left.mid', r)),
new Promise(r => MidiConvert.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/right.mid', r)),
new Promise(r => MidiConvert.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/left2.mid', r)),
new Promise(r => MidiConvert.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/right2.mid', r)),
new Promise(r => MidiConvert.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/left3.mid', r)),
new Promise(r => MidiConvert.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/969699/right3.mid', r))]).
then(
(
[_, __, leftMidi1, rightMidi1, leftMidi2, rightMidi2, leftMidi3, rightMidi3]) =>
{
  document.querySelector('.loading').remove();
  piano.pedalDown();

  let stopSong = beginSong(leftMidi1, rightMidi1, ACTIVE_COLOR_1);

  const g1Button = document.querySelector('#g1');
  const g2Button = document.querySelector('#g2');
  const g3Button = document.querySelector('#g3');

  g1Button.addEventListener('click', () => {
    if (stopSong) stopSong();
    stopSong = beginSong(leftMidi1, rightMidi1, ACTIVE_COLOR_1);
    g1Button.classList.add('active');
    g2Button.classList.remove('active');
    g3Button.classList.remove('active');
  });
  g2Button.addEventListener('click', () => {
    if (stopSong) stopSong();
    stopSong = beginSong(leftMidi2, rightMidi2, ACTIVE_COLOR_2);
    g1Button.classList.remove('active');
    g2Button.classList.add('active');
    g3Button.classList.remove('active');
  });
  g3Button.addEventListener('click', () => {
    if (stopSong) stopSong();
    stopSong = beginSong(leftMidi3, rightMidi3, ACTIVE_COLOR_3);
    g1Button.classList.remove('active');
    g2Button.classList.remove('active');
    g3Button.classList.add('active');
  });
}).
catch(e => console.error(e));