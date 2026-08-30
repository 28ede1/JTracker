// ---------------------------------------------------------------------------
// User routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
    createUser,
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

    const user = await createUser(req.userId, result.data)
    res.status(201).json(user);
})

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
