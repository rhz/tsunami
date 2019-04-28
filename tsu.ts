const people: L.Circle[] = []
const personRadius = 1

let active = false
let alertMode = false

const delay = 100 // time between the end of one step and the beginning of the next in milliseconds
let timeoutId = 0 // id given by setTimeout, used in clearTimeout

// map coordinates and zoom level
type Coord = [number, number]
const centre: Coord = [-33.0446605, -71.6235577] // plaza de la victoria
const zoomLevel = 16

// load map and tiles
const valpo = L.map('map').setView(centre, zoomLevel)
L.tileLayer('http://localhost:3001/{s}/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19
}).addTo(valpo)

// helper functions
const S = (id: string): HTMLElement => {
  const elem = document.getElementById(id)
  if (elem) return elem
  else throw new Error(
    "couldn't find element with id '" + id + "'")
}

// logging element
// const logElem = S('log')
// const log = (msg: string) => logElem.textContent += msg + '\n'

// debug
const debug = 1
const log = (...args: any[]) => {
  if (debug > 0)
    console.log(...args)
}
const logDate = (msg: string) =>
  log(new Date().toLocaleString() + ': ' + msg)

const simpleFetch = async (name: string) =>
  fetch('http://localhost:3000/' + name)
    .then(async (response) => {
      if (response.ok && response.status === 200)
        return response.json()
      else throw new Error(
        `http error occurred (response status is ${response.status})`)
    })
    .catch(error => {
      logDate(name + ': operation unsucessful')
      logDate(error.message)
    })

// move people synchronously one step
const moveStep = () => simpleFetch('moveStep').then(result =>
  people.forEach((p, i) => p.setLatLng(result[i])))

const startPeople = () => {
  moveStep()
  timeoutId = window.setTimeout(startPeople, delay)
}

const stopPeople = () => {
  window.clearTimeout(timeoutId)
}

const removeAllPeople = () => {
  simpleFetch('removeAllPeople')
  people.forEach(p => p.remove())
  people.length = 0
}

// clear map
const clearMap = () => {
  stopPeople()
  removeAllPeople()
}

// play and stop
const playAndStop = (btn: HTMLElement) => {
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
const tsunami = (btn: HTMLElement) => {
  simpleFetch('alert')
  alertMode = !alertMode
  if (alertMode) {
    btn.className += " tsunami-alert"
    btn.title = "Turn off tsunami alert"
  } else {
    btn.className = "btn btn-danger"
    btn.title = "Activate tsunami alert"
  }
}

interface Person {
  lat: number,
  lon: number,
  id: number
}

// add a person (drawn as a circle)
const addPersonToMap = ({ lat, lon, id }: Person): L.Circle | Error => {
  if (id !== people.length) { // error: ids don't match
    const msg = "addPerson: person ids don't match. " +
      `local is ${people.length} and remote is ${id}.`
    logDate(msg)
    return new Error(msg)
  }
  // no error: ids match
  let p = L.circle([lat, lon], {
    color: 'red',
    fillColor: '#f03',
    fillOpacity: 0.5,
    radius: personRadius
  }).addTo(valpo)
  people.push(p)
  return p
}

const addPerson = async ([lat, lon]: Coord): Promise<L.Circle | Error> => {
  const { id } = await simpleFetch(`addPerson/${lat}/${lon}`)
  return addPersonToMap({ id: id, lat: lat, lon: lon })
}

// spawn new people on the map by clicking on it
let addPeopleOnClick = false
valpo.on('click', (e: L.LeafletMouseEvent) =>
  addPeopleOnClick && addPerson([e.latlng.lat, e.latlng.lng]))

const switchAddPeopleOnClick = (btn: HTMLElement) => {
  addPeopleOnClick = !addPeopleOnClick
  if (addPeopleOnClick) {
    btn.className = "btn btn-dark"
  } else {
    btn.className = "btn btn-default"
  }
}

// add many people
const addManyPeople = async (n?: number) => {
  if (n === undefined)
    n = parseInt((S("num-people") as HTMLInputElement).value)
  const ps = await simpleFetch(`addPeople/${n}`)
  return ps.map(addPersonToMap)
}

