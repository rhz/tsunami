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

function S(id) {
  return document.getElementById(id);
}

// logging element
var logEle = S("log");
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
function addPerson(latlon) {
  var p = L.circle(latlon, {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5,
    radius: personRadius
  }).addTo(valpo)
  // people moves on the map
  // active = true
  // startPersonAfterDelay(p)
  people.push(p)
  return p
}
// var p1 = addPerson([-33.045, -71.6123])

// spawn new people on the map by clicking on it
valpo.on('click', (e) => addPerson(e.latlng))

// clear map
function clearMap() {
  for (var p of people) {
    window.clearTimeout(p.timeout);
    p.remove()
  }
  people = []
}

function choose(xs) {
  return xs[Math.floor(Math.random()*xs.length)]
}

function coords(building) {
  var xs = [], ys = []
  for (var nodeId of building.vertices) {
    xs.push(nodes[nodeId].lat)
    ys.push(nodes[nodeId].lon)
  }
  return [xs, ys]
}

function mean(xs) {
  return xs.reduce((a,b) => a+b, 0)/xs.length
}

// not used
function centreOfMass(building) {
  return coords(building).map((xs) => mean(xs))
}

// circumscribed square
function csq(building) {
  var [xs, ys] = coords(building)
  return [[Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)]]
}

// TODO: add people by pressing on button "add people"
// * people gets added next to buildings
// * perhaps the number of people is proportional to
//   the area of the building
// * how do we make sure people doesn't get added inside a building?
//   (eg inside the building next to the one they've been added to)
function addManyPeople() {
  var n = S("num-people").value,
      cs = []
  for (var i = 0; i < n; i++) {
    var b = choose(buildings),
        [[x1, y1], [x2, y2]] = csq(b),
        xdiff = x2-x1,
        ydiff = y2-y1,
        x3 = Math.random()*xdiff+x1,
        y3 = Math.random()*ydiff+y1
    addPerson([x3, y3])
  }
}

// play and stop
function playAndStop(btn) {
  if (active) {
    // stop moving people
    for (p of people)
      window.clearTimeout(p.timeout);
  } else {
    // start moving people
    for (p of people)
      startPersonAfterDelay(p)
  }
  active = !active
  if (active) {
    btn.innerHTML = "<i class=\"fas fa-pause\"></i>"
    btn.className = "btn btn-warning"
    btn.title = "Pause"
  } else {
    btn.innerHTML = "<i class=\"fas fa-play\"></i>"
    btn.className = "btn btn-success"
    btn.title = "Play"
  }
}

// tsunami alert
function tsunami(btn) {
  alertMode = !alertMode
  if (alertMode) {
    btn.className += " tsunami-alert"
    btn.title = "Turn off tsunami alert"
  } else {
    btn.className = "btn btn-danger"
    btn.title = "Activate tsunami alert"
  }
}

