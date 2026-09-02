// ---------------------------------------------------------------------------
// User routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
//
// Every route in this file is mounted behind requireAuth in app.ts, so the id
// each one writes comes from the token. The routes anyone can reach without an
// account live in user.public.routes.ts instead.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
    ensureUser,
    findUser,
    updateUser,
  } from "./user.service.ts";

import {
    newUserRules,
    updateUserRules,
} from "./user.validation.ts"

export const userRoutes = Router();

// "me" instead of an id in the path. There is no id to pass, because the only
// row a signed-in person is allowed to read here is their own, and that id
// comes from the token. A path like /users/:id would invite a client to try
// somebody else's, and then this file would need a guard against it.
userRoutes.get("/me", async (req, res) => {
    if (!req.userId) {
        res.status(401).json({ error: 'Not signed in' })
        return
    }

    const user = await findUser(req.userId)

    // Signing up and having a user row are two separate steps, so a real token
    // with no row yet is normal, not an error. The 404 is how the client knows
    // to send the person through profile setup.
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }

    res.json(user);
})

// Safe to call more than once. The browser sends this every time a session
// appears, which is far more often than there are rows to create, so ensureUser
// treats "it is already there" as an ordinary success rather than an error.
//
// No id in the path or the body. The row being written is always the caller's
// own, and the id for it comes from the token.
userRoutes.post("/", async (req, res) => {
    const result = newUserRules.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ error: "Invalid user data"});
        return;
    }

    if (!req.userId) {
        res.status(401).json({ error: 'Not signed in' })
        return
    }

    const user = await ensureUser(req.userId, result.data)
    res.status(201).json(user);
})

// Renaming. A username already taken by somebody else is refused by the unique
// index in the database, which errorHandler turns into a 409, so there is no
// check for it here.
userRoutes.patch("/", async(req, res) => {
    const result = updateUserRules.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ error: "Invalid user data"});
        return;
    } 

    if (!req.userId) {
        res.status(401).json({ error: 'Not signed in' })
        return
    } 

    const user = await updateUser(req.userId, result.data)
    res.status(200).json(user);
})
