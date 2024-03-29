import { Express, NextFunction, Request, RequestHandler, Response, json, urlencoded } from 'express';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { BasicStrategy } from 'passport-http';
import session from 'express-session';
import sessionFileStore from 'session-file-store';
import { ensureLoggedIn } from 'connect-ensure-login';
import argon2 from 'argon2';
import { readFile, writeFile } from 'node:fs/promises';
import { State } from '../state';
import { isErrorWithCode, randomString } from '../utils';
import { forCategory } from '../logger';

const logger = forCategory('auth');

interface User {
  username: string;
}

export function preStart(state: State) {
  passport.unuse(state.passportStrategies.local);
  passport.unuse(state.passportStrategies.basic);
  if (state.passportStrategies.local === '' && state.passportStrategies.basic === '') {
     // first run
    passport.serializeUser<string>(function(user, cb) {
      cb(null, (<User>user).username);
    });
    passport.deserializeUser<User>(function(user, cb) {
      cb(null, { username: user } );
    });
  }
  state.passportStrategies.local = '';
  state.passportStrategies.basic = '';
}

async function validateUserPassword(state: State, username: string, password: string, done: Parameters<ConstructorParameters<typeof LocalStrategy>[0]>[2]) {
  try {
    if (state.config.username !== username) {
      return done(null, false, { message: 'Incorrect username or password' });
    }
    const hash = await readFile(state.resolvedPasswordFile, { encoding: 'utf8' });
    if (await argon2.verify(hash, password)) {
      return done(null, { username: state.config.username });
    } else {
      return done(null, false, { message: 'Incorrect username or password' });
    }
  } catch {
    done(null, false, { message: 'Error verifying password'});
  }

}
export function use(state: State, app: Express) {

  app.set('trust proxy', 1);
  state.passportStrategies.local = randomString(12, 'p');
  passport.use(state.passportStrategies.local, new LocalStrategy(function (username, password, done) {
    validateUserPassword(state, username, password, done);
  }));

  state.passportStrategies.basic = randomString(12, 'p');
  passport.use(state.passportStrategies.basic, new BasicStrategy(function (username, password, done) {
    validateUserPassword(state, username, password, done);
  }));

  const FileStore = sessionFileStore(session);
  const sessionExpireSeconds = state.config.sessionExpire === 0 ? (100 * 365 * 86400) : state.config.sessionExpire * 86400;
  app.use(session({
    secret: state.config.sessionSecrets,
    resave: false,
    saveUninitialized: false,
    name: 'sonarrtorss.sid',
    cookie: {
      sameSite: true,
      maxAge: sessionExpireSeconds * 1000,
    },

    store: new FileStore({
      path: state.resolvedSessionDirectory,
      logFn: () => {},
      ttl: sessionExpireSeconds
    })
  }));
  app.use(passport.session());
}

function jsonError(res: Response, error: unknown) {
  res.json({
    result: 'error',
    error
  });
}
export function localLogin(state: State) {
  return [
    json(),
    passport.authenticate(state.passportStrategies.local, { failureMessage: true, failWithError: true, keepSessionInfo: true }),
    (req: Request, res: Response) => {
      const session: typeof req.session & { returnTo?: string, messages?: Array<string> } = req.session;
      if (req.user) {
        const url = session?.returnTo ?? '/';
        delete session?.returnTo;
        res.json({
          result: 'OK',
          redirectTo: state.resolveUrlPath(url)
        });
      }
    },
    (err: Error, req: Request, res: Response, next: NextFunction) => { //eslint-disable-line @typescript-eslint/no-unused-vars
      const session: typeof req.session & { returnTo?: string, messages?: Array<string> } = req.session;
      const message = session.messages?.[0] ?? 'Login failed';
      delete session?.messages;
      return jsonError(res, message);
    }
  ];
}

export function basicLogin(state: State) {
  return [
    urlencoded({ extended: false }),
    passport.authenticate(state.passportStrategies.basic, {
      session: false
    })
  ];
}

export async function updatePassword(state:State, password: string) {
  try {
    const hashed = await argon2.hash(password);
    await writeFile(state.resolvedPasswordFile, hashed, { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    if (isErrorWithCode(e)) {
      // write file error, this is the only throw that should happen
      logger.error(`Config file ${state.resolvedPasswordFile} cannot be written. ${e.code} ${e.message}`);
    } else if (e instanceof Error) {
      logger.error(`Config file ${state.resolvedPasswordFile} cannot be written. ${e.message}`);
    } else {
      logger.error(`Config file ${state.resolvedPasswordFile} cannot be written. ${e}`);
    }
    throw 'Could not write password file';
  }
}

export function authenticated(state: State): RequestHandler {
  return state.config.configured ?
    ensureLoggedIn(state.resolveUrlPath('/login')) :
    function(req, res, next) { next(); };
}

export default {
  preStart,
  use,
  authenticated,
  localLogin,
  httpLogin: basicLogin,
  updatePassword,
};
