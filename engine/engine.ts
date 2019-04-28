import * as pbfParser from './osm-read/lib/pbfParser.js'
import * as express from 'express'
import * as cors from 'cors'
import * as proj4 from 'proj4'

type Coord = [number, number]

const people: Coord[] = []
const personRadius = 1
var alertMode = false

// debug
const debugLevel = 1
const log = (...args: any[]) => {
  if (debugLevel > 0)
    console.log(...args)
  if (args.length == 1)
    return args[0]
}

// utils
const randomIndex = (xs: any[]) => Math.floor(Math.random() * xs.length)
const choose = (xs: any[]) => xs[randomIndex(xs)]
const repeat = (n: number) => <T>(f: (i: number) => T) => {
  const xs: T[] = []
  for (let i = 0; i < n; i++)
    xs.push(f(i))
  return xs
}
// const repeat = (n: number) => <T>(f: (i: number) => T) =>
//   [...Array(n)].map((_, i) => f(i)) // doesn't work in async functions?
// type Obj = { [x: string]: any } // is Obj different from any?
// const id = <T>(x: T): T => x
// const last = (xs: any[]) => xs[xs.length - 1]
// const mean = (xs: any[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// const originLatlon = [-33.0421, -71.6123]
// const originLatlon = [-33.0446605, -71.6235577] // plaza de la victoria

// Stereographic projection (conformal)
// After reading a lot about map projections from
// https://en.wikipedia.org/wiki/Map_projection,
// the links therein and other sources like
// http://www.quickclose.com.au/LocalTMGrids_PNG_Stanaway.pdf
// I've come to the conclusion that for small areas
// like a city that is more or less equal height and width
// the best projection is the stereographic projection.
// https://en.wikipedia.org/wiki/Stereographic_projection
// The question now is how do I make a custom
// stereographic projection that uses as projection point
// the antipode of the city centre,
// giving the (0,0) position to the city centre,
// to obtain the least distortion.
// TODO: should I use polar coordinates on the plane?
// const stereoProj = "+proj=sterea +lat_0=-33.0446605 +lon_0=-71.6235577 +ellps=WGS84 +datum=WGS84 +units=m +no_defs"
const utmProj = "+proj=utm +zone=19 +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs"
const projection = proj4(utmProj)
const projectCoord = (latlon: Coord): Coord =>
  projection.forward(latlon)
const project = (latlons: Coord[]): Coord[] => {
  return latlons.map(projectCoord)
}
// const ori: [number, number] = [-71.6235577, -33.0446605]
// log(projectCoord(ori))
// log(projection.forward({ x: ori[0], y: ori[1] }))
// log(proj4(stereoProj, ori))
// log(proj4("WGS84", stereoProj, ori))

const unprojectCoord = (xy: Coord): Coord =>
  projection.inverse(xy)
const unproject = (xys: Coord[]): Coord[] => {
  return xys.map(unprojectCoord)
}

interface Building {
  readonly vertices: Coord[],
  exitDoor?: Coord
}

// parse pbf file
const parsePbf = (filename: string): Promise<Building[]> => {
  interface Way {
    nodeRefs: number[],
    tags: string[]
  }
  interface Node {
    id: number,
    lat: number,
    lon: number
  }
  let nodeCount = 0, wayCount = 0, relCount = 0 //, polygonCount = 0
  // const isPolygon = (way: Way) =>
  //   way.nodeRefs[0] === last(way.nodeRefs)
  const isCyclic = (xs: any[]) => xs.pop() === xs[0]
  const nodes: { [i: number]: Node } = {}
  const buildings: number[][] = []
  const start = Date.now()
  log('parsing pbf file')
  return new Promise((resolve, reject) => {
    pbfParser.parse({
      filePath: filename,
      endDocument: () => {
        // print some stats of the map
        log(nodeCount + ' nodes')
        // log(wayCount + ' ways of which ' + buildings.length +
        //   ' are buildings and ' + polygonCount + ' are polygons')
        log(wayCount + ' ways of which ' +
          buildings.length + ' are buildings')
        log(relCount + ' relations')
        log('finished reading ' + filename + ' in ' +
          (Date.now() - start) / 1000 + ' seconds')
        // resolve projected coordinates
        let bLatlons: Coord[][] = buildings.map(
          (xs: number[]): Coord[] => xs.map(
            (x: number): Coord =>
              [nodes[x].lat, nodes[x].lon]))
        resolve(bLatlons.map(xs => ({ vertices: project(xs) })))
      },
      node: (node: Node) => {
        nodeCount += 1
        nodes[node.id] = node
      },
      way: (way: Way) => {
        wayCount += 1
        // if (isPolygon(way))
        //   polygonCount += 1
        if ('building' in way.tags) {
          let xs = way.nodeRefs
          // xs.pop()
          // if (isPolygon(way) && xs.length > 0) {
          if (xs.length > 1 && isCyclic(xs)) {
            buildings.push(xs)
          } else {
            // NOTE: there's one way which is a building but not a polygon
            // maybe it was cut in half when generating the pbf file?
            // NOTE: two buildings have just one vertex, why? same problem?
            log('building is not a polygon:', JSON.stringify(way))
          }
        }
      },
      relation: () => { // (rel) => {
        relCount += 1
      },
      error: (msg: string) => {
        log('error: ' + msg)
        reject(msg)
      }
    })
  })
}

const computeExitDoor = (b: Building): Coord => {
  // TODO: only choose among edges that are not part of
  // another building
  let r1 = randomIndex(b.vertices)
  let [x1, y1] = b.vertices[r1]
  let [x2, y2] = b.vertices[
    r1 == b.vertices.length - 1 ? 0 : r1 + 1]
  let r2 = Math.random()
  // TODO: check that exit door leads to a street
  // and put it a delta off the building
  let x3 = Math.min(x1, x2) + r2 * Math.abs(x1 - x2)
  let y3 = Math.min(y1, y2) + r2 * Math.abs(y1 - y2)
  return [x3, y3]
}

const buildingProps = (buildings: Building[]) => {
  // choose "exit point/door" for each building
  for (let b of buildings) {
    b.exitDoor = computeExitDoor(b)
    // TODO: compute exit angle
  }
  return buildings
}

const printAndRet = (valOrFn: any) => (...args: any[]) => {
  console.log(...args)
  if (typeof valOrFn === 'function') return valOrFn(...args)
  else return valOrFn
}

const buildings: Promise<Building[]> =
  parsePbf('valpo.osm.pbf')
    .then(buildingProps)
    .catch(printAndRet([]))

// add a person at the given coordinates
// const addPerson = ([lat, lon]: Coord): object => {
//   const id = people.length
//   const [x, y] = projectCoord([lat, lon])
//   people.push([x, y])
//   log(`adding person with id ${id} and coordinates ${x},${y}`)
//   return { lat: lat, lon: lon, id: id }
// }

interface Person {
  lat: number,
  lon: number,
  id: number
}

const addPerson = ([x, y]: Coord): Person => {
  const id = people.length
  people.push([x, y])
  log(`adding person with id ${id} and coordinates ${x},${y}`)
  const [lat, lon] = unprojectCoord([x, y])
  return { id: id, lat: lat, lon: lon }
}

// move a person on the map
const moveBy = ([x, y]: Coord, angle: number, len: number): Coord => {
  const x2 = x + len * Math.cos(angle)
  const y2 = y - len * Math.sin(angle)
  return [x2, y2]
}

const chooseAngle = (): number =>
  alertMode ?
    Math.random() * Math.PI + Math.PI :
    Math.random() * 2 * Math.PI

const chooseVelocity = (): number => Math.random()

const distance = ([x1, y1]: Coord, [x2, y2]: Coord): number =>
  Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1))

const movePerson = (i: number, numAttempt: number = 0) => {
  log(`moving person ${i}`)
  const xy1 = people[i]
  const angle = chooseAngle()
  let len = chooseVelocity()
  let xy2 = moveBy(xy1, angle, len) // new position
  // check for collisions with other people
  log(`checking collisions for person ${i} at new position ${xy2}`)
  people.forEach((xy3: Coord, j: number) => {
    if (i !== j) {
      log(`checking collision with person ${j} at position ${xy3}`)
      let c = 0
      while (distance(xy2, xy3) < 2 * personRadius) {
        if (c >= 4) {
          if (numAttempt >= 4) {
            log('more than 4 collisions found and ' +
              `more than 4 attempts at moving person ${i}` +
              'in different directions')
            log(`giving up on person ${i}`)
            return null
          } else {
            log('more than 4 collisions found. ' +
              `try moving person ${i} in a different direcion`)
            movePerson(i, numAttempt + 1)
          }
        }
        len /= 2
        xy2 = moveBy(xy1, angle, len)
        log(`collision found.person ${i} new position is ${xy2} `)
        c++
      }
      log(`${c} collisions found with ${j} `)
    }
  })
  // TODO: check for collisions with buildings
  people[i] = xy2
}

// move people synchronously one step
const moveStep = () => {
  people.forEach((_, i) => movePerson(i))
  return people
}

// remove all people
const removeAllPeople = () => {
  // people = [] // assignment isn't possible on a const
  people.length = 0
  return { success: true }
}

// function coords(building) {
//   let xs = [], ys = []
//   for (let nodeId of building.vertices) {
//     xs.push(nodes[nodeId].lat)
//     ys.push(nodes[nodeId].lon)
//   }
//   return [xs, ys]
// }

// these two functions are not used but might come handy later on
// function centreOfMass(building) {
//   return coords(building).map((xs) => mean(xs))
// }

// circumscribed square
// function csq(building) {
//   let [xs, ys] = coords(building)
//   return [[Math.min(...xs), Math.min(...ys)],
//   [Math.max(...xs), Math.max(...ys)]]
// }

const alert = () => {
  alertMode = !alertMode
}

// web app
const app = express()
app.use(cors())
const simpleGet = <T>(route: string, f: (params: any) => T | Promise<T>) => {
  app.get(route, async (request, response) => {
    try {
      response.json(await f(request.params))
    } catch (error) {
      log(error.message)
      response.sendStatus(400)
    }
  })
}

simpleGet<Person>('/addPerson/:lat/:lon',
  ({ lat, lon }) => addPerson(projectCoord(
    [parseFloat(lat), parseFloat(lon)])))
// TODO: add people by pressing on button "add people"
// * people gets added next to buildings
// * perhaps the number of people is proportional to
//   the area of the building
// * how do we make sure people doesn't get added inside a building?
//   (eg inside the building next to the one they've been added to)
simpleGet<Person[]>('/addPeople/:n(\\d+)', async ({ n }) => {
  const bs = await buildings
  log(`add ${n} people`)
  return repeat(parseInt(n))(
    () => addPerson(choose(bs).exitDoor))
})
simpleGet('/removeAllPeople/', () => removeAllPeople())
simpleGet<Person[]>('/moveStep/', () => unproject(moveStep()).map(
  ([lat, lon], i) => ({ lat: lat, lon: lon, id: i })))
simpleGet('/alert/', () => alert())

const port = 3000
app.listen(port)



