import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import * as jose from 'jose'
import Koa from 'koa'
import mount from 'koa-mount'
import Provider from 'oidc-provider'
import Router from '@koa/router'
import views from 'koa-views'

const app = new Koa()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(async (ctx, next) => {
    try {
        await next()
    } catch (e) {
        console.log(e.message)
        e.status = e.statusCode || e.status || 500
        ctx.body = e.message
        ctx.app.emit('error', e, ctx)
    }
})

/*********************************
 * Generate openid-configuration *
 *********************************/

// read gcp service account key from file
const rawData = await fs.readFile('sandbox-289103-5a62de48ebfc.json')
const gcpKey = JSON.parse(rawData)

// import gcp service account key
const privateJWKObj = await jose.importPKCS8(gcpKey.private_key, 'RS256')

// export JWK
const privateJWK = await jose.exportJWK(privateJWKObj)

const configuration = {
    jwks: {
        keys: [ privateJWK ],
    },
    features: {
        devInteractions: {
            enabled: false,
        },
    },
    cookies: {
        keys: [ 'my secret key 1' ],
    },
    renderError: async (ctx, out, error) => {
        console.log(error)
        ctx.body = 'See terminal'
    },
}
const oidc = new Provider('http://abc.witheztravel.com', configuration)

app.use(mount('/', oidc.app))

/*********************************
 * Setup views engine and router *
 *********************************/

const render = views(__dirname + '/views', { map: { html: 'ejs' } })
app.use(render)

const viewsRouter = new Router()
viewsRouter.get('/upload.html', async (ctx, next) => {
    await ctx.render('upload.ejs')
})

app.use(mount('/', viewsRouter.routes()))

const apiRouter = new Router()
apiRouter.get('/token', async (ctx, next) => {
    const jwt = await new jose.SignJWT({})
    .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
    })
    .setIssuedAt()
    .setIssuer('http://abc.witheztravel.com')
    .setSubject('CUS000123456')
    .setAudience('https://us-central1-sandbox-289103.cloudfunctions.net/function-1')
    .setExpirationTime('1 minute')
    .sign(privateJWKObj)
    ctx.body = jwt
})

app.use(mount('/api', apiRouter.routes()))

app.listen(3000)
console.log('listening on port 3000')
