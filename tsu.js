// note: 0.0001 degrees in latitude at -33.0421 is about 11 meters
// according to http://www.csgnetwork.com/degreelenllavcalc.html
var active = false,
    alertMode = false,
    timeoutId = 0, // id given by setTimeout is used in clearTimeout
    delay = 100, // time between one step and the next in milliseconds
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

// helper functions
let S = id => document.getElementById(id)
let last = xs => xs[xs.length-1]
let randomIndex = xs => Math.floor(Math.random()*xs.length)
let choose = xs => xs[randomIndex(xs)]
let mean = xs => xs.reduce((a,b) => a+b, 0)/xs.length
let repeat = (n) => (f) => [...Array(n)].map((_, i) => f(i))

// logging element
var logEle = S("log")
function log(msg) {
  logEle.textContent += msg + '\n'
}

// polygons
let isPolygon = way => way.nodeRefs[0] === last(way.nodeRefs)

function drawPolygon(vertices) {
  let latlons = []
  for (let nodeId of vertices) {
    latlons.push([nodes[nodeId].lat, nodes[nodeId].lon])
  }
  valpo.panTo(latlons[0])
  return L.polygon(latlons).addTo(valpo)
}

function isInBuilding(latlon, building) {
}

function computeExitDoor(b) {
  // TODO: only choose among edges that are not part of
  // another building
  var r1 = randomIndex(b.vertices),
      {lat: lat1, lon: lon1} = nodes[b.vertices[r1]],
      {lat: lat2, lon: lon2} = nodes[b.vertices[
        r1 == b.vertices.length-1? 0 : r1+1]],
      r2 = Math.random()
  // TODO: check that exit door leads to a street
  // and put it a delta off the building
  return [Math.min(lat1, lat2)+r2*Math.abs(lat1-lat2),
          Math.min(lon1, lon2)+r2*Math.abs(lon1-lon2)]
}

// TODO: add progress bar
function afterParse() {
  // choose "exit point/door" for each building
  for (let b of buildings) {
    b.exitDoor = computeExitDoor(b)
    // TODO: compute exit angle
  }
  // let the user know that people can be added and moved now
  S("play-and-stop").disabled = false
  S("add-people").disabled = false
  S("switch-add").disabled = false
}

// parse pbf file
var start = Date.now()
// TODO: add progress bar
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
        let xs = way.nodeRefs
        xs.pop()
        // NOTE: two buildings have just one vertex, why?
        if (xs.length > 0)
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
function moveBy(latlon, angle, len) {
  let {x: px, y: py} = valpo.project(latlon, zoomLevel),
      nx = px + len * Math.cos(angle),
      ny = py - len * Math.sin(angle)
  return valpo.unproject([nx, ny], zoomLevel)
}

function chooseAngle() {
  return alertMode?
    Math.random()*Math.PI+Math.PI :
    Math.random()*2*Math.PI
}

function chooseVelocity() {
  return Math.random()
}

function movePerson(p) {
  let angle = chooseAngle(),
      // unfortunately len is measured in pixels instead of meters
      // 1 pixel is about 2 meters at zoomLevel = 16
      len = chooseVelocity(),
      ppos = p.getLatLng(), // current position
      npos = moveBy(ppos, angle, len) // new position
  // check for collisions with other people
  for (let q of people) {
    if (q !== p) {
      let qpos = q.getLatLng()
      while (qpos.distanceTo(npos) < 2*personRadius) {
        len /= 2
        npos = moveBy(ppos, angle, len)
      }
    }
  }
  // TODO: check for collisions with buildings
  p.setLatLng(npos)
}

// move people synchronously one step.
function moveStep() {
  for (let p of people)
    movePerson(p)
}

function startPeople() {
  moveStep()
  timeoutId = window.setTimeout(startPeople, delay)
}

function stopPeople() {
  window.clearTimeout(timeoutId)
}

function removePeople() {
  for (let p of people) {
    p.remove()
  }
  people = []
}

// clear map
function clearMap() {
  stopPeople()
  removePeople()
}

// play and stop
function playAndStop(btn) {
  if (active) {
    stopPeople()
  } else {
    startPeople()
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


// add a person (drawn as a circle)
function addPerson(latlon) {
  let p = L.circle(latlon, {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5,
    radius: personRadius
  }).addTo(valpo)
  people.push(p)
  return p
}

// spawn new people on the map by clicking on it
var addPeopleOnClick = false
valpo.on('click', (e) => addPeopleOnClick && addPerson(e.latlng))

function switchAddPeopleOnClick(btn) {
  addPeopleOnClick = !addPeopleOnClick
  if (addPeopleOnClick) {
    btn.className = "btn btn-dark"
  } else {
    btn.className = "btn btn-default"
  }
}

function coords(building) {
  let xs = [], ys = []
  for (let nodeId of building.vertices) {
    xs.push(nodes[nodeId].lat)
    ys.push(nodes[nodeId].lon)
  }
  return [xs, ys]
}

// these two functions are not used but might come handy later on
function centreOfMass(building) {
  return coords(building).map((xs) => mean(xs))
}

// circumscribed square
function csq(building) {
  let [xs, ys] = coords(building)
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
  let n = parseInt(S("num-people").value)
  repeat (n) (() => addPerson(choose(buildings).exitDoor))
}

