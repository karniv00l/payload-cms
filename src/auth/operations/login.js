const jwt = require('jsonwebtoken');
const { AuthenticationError } = require('../../errors');

async function login(args) {
  const { config, operations } = this;

  const options = { ...args };

  // /////////////////////////////////////
  // 1. Execute before login hook
  // /////////////////////////////////////

  args.collection.config.hooks.beforeLogin.forEach((hook) => hook({ req: args.req }));

  // /////////////////////////////////////
  // 2. Perform login
  // /////////////////////////////////////

  const {
    collection: {
      Model,
      config: collectionConfig,
    },
    data,
    req,
  } = options;

  const { email: unsanitizedEmail, password } = data;

  const email = unsanitizedEmail ? unsanitizedEmail.toLowerCase() : null;

  const userDoc = await Model.findByUsername(email);


  if (!userDoc) throw new AuthenticationError();

  const authResult = await userDoc.authenticate(password);

  if (!authResult.user) {
    throw new AuthenticationError();
  }

  const userQuery = await operations.collections.find({
    where: {
      email: {
        equals: email,
      },
    },
    collection: {
      Model,
      config: collectionConfig,
    },
    req,
    overrideAccess: true,
  });

  const user = userQuery.docs[0];

  const fieldsToSign = collectionConfig.fields.reduce((signedFields, field) => {
    const result = {
      ...signedFields,
    };

    if (!field.name && field.fields) {
      field.fields.forEach((subField) => {
        if (subField.saveToJWT) {
          result[subField.name] = user[subField.name];
        }
      });
    }

    if (field.saveToJWT) {
      result[field.name] = user[field.name];
    }

    return result;
  }, {
    email,
    id: user.id,
    collection: collectionConfig.slug,
  });

  const token = jwt.sign(
    fieldsToSign,
    config.secret,
    {
      expiresIn: collectionConfig.auth.tokenExpiration,
    },
  );

  if (args.res) {
    const cookieOptions = {
      path: '/',
      httpOnly: true,
    };

    if (collectionConfig.auth.secureCookie) {
      cookieOptions.secure = true;
    }

    if (collectionConfig.auth.sameSite) {
      cookieOptions.sameSite = collectionConfig.auth.sameSite;
    }

    args.res.cookie(`${config.cookiePrefix}-token`, token, cookieOptions);
  }

  // /////////////////////////////////////
  // 3. Execute after login hook
  // /////////////////////////////////////

  args.collection.config.hooks.afterLogin.forEach((hook) => hook({ token, user, req: args.req }));

  // /////////////////////////////////////
  // 4. Return token
  // /////////////////////////////////////

  return token;
}

module.exports = login;
