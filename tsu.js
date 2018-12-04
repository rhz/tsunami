// note: 0.0001 degrees in latitude at -33.0421 is about 11 meters
// according to http://www.csgnetwork.com/degreelenllavcalc.html
var active = false,
    people = [],
    delay = 1000,
    dlatmax = 0.0001, // max delta latitude
    dlngmax = 0.0001  // max delta longitude

// load map and tiles
var valpo = L.map('map').setView([-33.0421, -71.6123], 15)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
}).addTo(valpo)

// move a person on the map
function movePerson(p) {
  var {lat, lng} = p.getLatLng(),
      dlat = Math.random()*2*dlatmax-dlatmax,
      dlng = Math.random()*2*dlngmax-dlngmax
  p.setLatLng([lat+dlat, lng+dlng])
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
    radius: 1
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

// parse pbf file
var logEle = document.getElementById("log");
function log(msg) {
  logEle.textContent += msg + '\n';
}
var nodeCount = 0,
    wayCount = 0,
    relCount = 0,
    polygonCount = 0,
    buildingCount = 0,
    start = Date.now(),
    nodes = {}
// var first = true
function last(xs) {
  return xs[xs.length-1]
}
function isPolygon(way) {
  return way.nodeRefs[0] === last(way.nodeRefs)
}
function drawPolygon(way) {
  var latlons = []
  for (nodeId of way.nodeRefs) {
    latlons.push([nodes[nodeId].lat, nodes[nodeId].lon])
  }
  // valpo.panTo(latlons[0])
  return L.polygon(latlons).addTo(valpo);
}
var a = pbfParser.parse({
  filePath: 'valpo.osm.pbf',
  endDocument: function() {
    log(nodeCount + ' nodes')
    log(wayCount + ' ways of which ' + buildingCount +
        ' are buildings and ' + polygonCount + ' are polygons')
    log(relCount + ' relations')
    log('finished reading ' + this.filePath + ' in ' +
        (Date.now() - start)/1000 + ' seconds')
  },
  bounds: function(bounds) {
    log('bounds: ' + JSON.stringify(bounds))
  },
  node: function(node) {
    nodeCount += 1
    nodes[node.id] = node
    // log('node: ' + JSON.stringify(node))
  },
  way: function(way) {
    wayCount += 1
    if (isPolygon(way))
      polygonCount += 1
    if ('building' in way.tags) {
      buildingCount += 1
      // TODO: there's one way which is a building and not a polygon
      // maybe a building that was cut in half
      // when generating the pbf file?
      // if (!isPolygon(way))
      //   log('way: ' + JSON.stringify(way))
      // if (first) {
      //   drawPolygon(way)
      //   log('way: ' + JSON.stringify(way))
      //   first = false
      // }
    }
    // log('way: ' + JSON.stringify(way))
  },
  relation: function(relation) {
    relCount += 1
    // log('relation: ' + JSON.stringify(relation))
  },
  error: function(msg) {
    log('error: ' + msg)
    throw msg
  }
})
