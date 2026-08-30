// ---------------------------------------------------------------------------
// User routes
//
// Handles the web side: read the request, check the input, call the service,
// send a response. No database code here.
// ---------------------------------------------------------------------------

import { Router } from "express";

import {
    createUser,
    updateUser,
  } from "./user.service.ts";

import {
    newUserRules,
    updateUserRules,
} from "./user.validation.ts"

export const userRoutes = Router();

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
