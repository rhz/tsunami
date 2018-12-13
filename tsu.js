// note: 0.0001 degrees in latitude at -33.0421 is about 11 meters
// according to http://www.csgnetwork.com/degreelenllavcalc.html
var active = false,
    alertMode = false,
    delay = 1000, // how often to iterate
    // people and their properties
    people = [],
    personRadius = 1,
    // map coordinates and zoom level
    centre = [-33.0421, -71.6123],
    zoomLevel = 16,
    // map objects (nodes, ways, relations)
    nodeCount = 0,
    wayCount = 0,
    relCount = 0,
    polygonCount = 0,
    nodes = {},
    buildings = []

// load map and tiles
var valpo = L.map('map').setView(centre, zoomLevel)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
}).addTo(valpo)

// logging element
var logEle = document.getElementById("log");
function log(msg) {
  logEle.textContent += msg + '\n';
}

// helper function
function last(xs) {
  return xs[xs.length-1]
}

// polygons
function isPolygon(way) {
  return way.nodeRefs[0] === last(way.nodeRefs)
}

function drawPolygon(vertices) {
  var latlons = []
  for (nodeId of vertices) {
    latlons.push([nodes[nodeId].lat, nodes[nodeId].lon])
  }
  valpo.panTo(latlons[0])
  return L.polygon(latlons).addTo(valpo);
}

function afterParse() {
  // log('way: ' + JSON.stringify(buildings[0]))
  // drawPolygon(buildings[0].vertices)
}

// parse pbf file
var start = Date.now()
pbfParser.parse({
  filePath: 'valpo.osm.pbf',
  endDocument: function() {
    // print some stats of the map
    log(nodeCount + ' nodes')
    log(wayCount + ' ways of which ' + buildings.length +
        ' are buildings and ' + polygonCount + ' are polygons')
    log(relCount + ' relations')
    log('finished reading ' + this.filePath + ' in ' +
        (Date.now() - start)/1000 + ' seconds')
    // continue with the execution of model
    afterParse()
  },
  node: function(node) {
    nodeCount += 1
    nodes[node.id] = node
  },
  way: function(way) {
    wayCount += 1
    if (isPolygon(way))
      polygonCount += 1
    if ('building' in way.tags) {
      if (isPolygon(way)) {
        var xs = way.nodeRefs
        xs.pop()
        buildings.push({vertices: xs})
      } else {
        // NOTE: there's one way which is a building but not a polygon
        // maybe it was cut in half when generating the pbf file?
        log('building is not a polygon: ' + JSON.stringify(way))
      }
    }
  },
  relation: function(relation) {
    relCount += 1
  },
  error: function(msg) {
    log('error: ' + msg)
    throw msg
  }
})


// move a person on the map
function moveBy(latlng, angle, len) {
  var {x: px, y: py} = valpo.project(latlng, zoomLevel),
      nx = px + len * Math.cos(angle),
      ny = py + len * Math.sin(angle)
  return valpo.unproject([nx, ny], zoomLevel)
}

function chooseAngle() {
  return alertMode?
    Math.random()*Math.PI+Math.PI :
    Math.random()*2*Math.PI;
}

function chooseVelocity() {
  return Math.random()
}

function movePerson(p) {
  var angle = chooseAngle(),
      // unfortunately len is measured in pixels instead of meters
      // 1 pixel is about 2 meters at zoomLevel = 16
      len = chooseVelocity(),
      ppos = p.getLatLng(), // current position
      npos = moveBy(ppos, angle, len) // new position
  // check for collisions with other people
  for (var q of people) {
    if (q !== p) {
      var qpos = q.getLatLng()
      while (qpos.distanceTo(npos) < 2*personRadius) {
        len /= 2
        npos = moveBy(ppos, angle, len)
      }
    }
  }
  // TODO: check for collisions with buildings
  p.setLatLng(npos)
}

function startPersonAfterDelay(p) {
  p.timeout = window.setTimeout(startPerson(p), delay)
}

function startPerson(p) {
  return () => {
    movePerson(p)
    if (active)
      startPersonAfterDelay(p)
  }
}

function move() { // one step
  for (var p of people)
    movePerson(p)
}

// add a person (drawn as a circle)
function addPerson(latlng) {
  var p = L.circle(latlng, {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5,
    radius: personRadius
  }).addTo(valpo)
  // people moves on the map
  active = true // play()
  startPersonAfterDelay(p)
  people.push(p)
  return p
}
var p1 = addPerson([-33.045, -71.6123])

// spawn new people on the map by clicking on it
valpo.on('click', (e) => addPerson(e.latlng))

// stop people
function stop() {
  active = false;
  for (p of people)
    window.clearTimeout(p.timeout);
}

// play
function play() {
  active = true;
  for (p of people)
    startPersonAfterDelay(p)
}

// tsunami alert
function tsunami() {
  alertMode = !alertMode
  if (alertMode)
    document.getElementById("alert").className += " tsunami-alert"
  else
    document.getElementById("alert").className = "btn btn-danger"
}

