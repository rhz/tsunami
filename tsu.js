// note: 0.0001 degrees in latitude at -33.0421 is about 11 meters
// according to http://www.csgnetwork.com/degreelenllavcalc.html
var active = false,
    people = [],
    delay = 1000,
    dlatmax = 0.0001, // max delta latitude
    dlngmax = 0.0001, // max delta longitude
    centre = [-33.0421, -71.6123],
    zoomLevel = 16,
    personRadius = 1

// load map and tiles
var valpo = L.map('map').setView(centre, zoomLevel)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
}).addTo(valpo)

// move a person on the map
function movePerson(p) {
  var ppos = p.getLatLng(),
      dlat = Math.random()*2*dlatmax-dlatmax, // delta lat
      dlng = Math.random()*2*dlngmax-dlngmax, // delta lng
      npos = [ppos.lat+dlat, ppos.lng+dlng], // new position
      overlap = false
  for (var q of people) {
    if (q !== p) {
      var qpos = q.getLatLng(),
          dist = valpo.distance(npos, qpos)
      if (dist < 2*personRadius) {
        overlap = true
        break
      }
    }
  }
  if (!overlap)
    p.setLatLng(npos)
}
function movePersonAfterDelay(p) {
  var id = window.setTimeout(movePersonRepeat(p), delay)
  p.timeout = id
}
function movePersonRepeat(p) {
  return () => {
    movePerson(p)
    if (active) movePersonAfterDelay(p)
  }
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
  movePersonAfterDelay(p)
  people.push(p)
  return p
}
var p1 = addPerson([-33.045, -71.6123])

// spawn new people on the map by clicking on it
function onMapClick(e) {
  addPerson(e.latlng)
}
valpo.on('click', onMapClick)

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
    movePersonAfterDelay(p)
}

// logging element
var logEle = document.getElementById("log");
function log(msg) {
  logEle.textContent += msg + '\n';
}

var nodeCount = 0,
    wayCount = 0,
    relCount = 0,
    polygonCount = 0,
    start = Date.now(),
    nodes = {},
    buildings = []

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
      buildings.push({vertices: way.nodeRefs})
      // NOTE: there's one way which is a building and not a polygon
      // maybe a building that was cut in half
      // when generating the pbf file?
      if (!isPolygon(way))
        log('building is not a polygon: ' + JSON.stringify(way))
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

