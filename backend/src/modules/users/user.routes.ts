// ---------------------------------------------------------------------------
// User routes
//
// Reads the request, and if input is valid, calls the proper service and sends
// the response back to the client. Mounted behind requireAuth in app.ts, so the
// id each route writes comes from the token. The routes anyone can reach
// without an account live in user.public.routes.ts instead.
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

// "me" instead of an id in the path, because the only row a signed-in person
// may read here is their own and that id comes from the token.
userRoutes.get("/me", async (req, res) => {
    if (!req.userId) {
        res.status(401).json({ error: 'Not signed in' })
        return
    }

    const user = await findUser(req.userId)

    // Signing up and having a user row are two separate steps, so a real token
    // with no row yet is normal. The 404 is what sends the client to setup.
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }

    res.json(user);
})

// Safe to call more than once, because ensureUser treats "already there" as an
// ordinary success.
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

// Renaming. A username already taken is refused by the unique index in the
// database, which errorHandler turns into a 409, so there is no check here.
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
