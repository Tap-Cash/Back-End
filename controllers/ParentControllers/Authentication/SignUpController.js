import { PrismaClient } from "@prisma/client";
import { validateNID } from "../../../services/NationalIDServices.js"
import { hashPassword, createJWT } from '../../../helpers.js'
import fs from 'fs';

import { UserRepository } from '../../../repositories/UserRepository.js'

let prisma = new PrismaClient()
const userRepository = new UserRepository(prisma);


export async function signUp(req, res, next) {

    let path;

    try {

        // checking if the request contains files and images
        if (!req.files || !req.files.image || req.fileError) {
            return res.status(400).json({ message: "Invalid file upload" });
        }

        // the path to the last saved image
        path = `uploads/NationalIDs/${req.files.image[0].filename}`;

        // check if the national ID is registered before
        const existingNationalID = await userRepository.findUserByNationalID(req.body.nationalID);

        if (existingNationalID) {
            fs.unlinkSync(path);
            return res.status(406).json({ message: "National ID already registered" })
        }

        // check if the phone number is registered before
        const existingPhone = await userRepository.findUserByPhone(req.body.phone);

        if (existingPhone) {
            fs.unlinkSync(path);
            return res.status(406).json({ message: "Phone number already registered" })
        }


        // check if the username is registered before
        const existingUsername = await userRepository.findUserByUsername(req.body.username)

        if (existingUsername) {
            fs.unlinkSync(path);
            return res.status(406).json({ message: "Username already registered" })
        }

        // validate the entered national id if all the previous checks passed 
        if (validateNID(req.body.nationalID)) {

            let userData = req.body;

            // hashing the password 
            const hashedPassword = await hashPassword(userData.password);
            userData.password = hashedPassword;

            // setting values to fields 
            userData.balance = 0;
            userData.nationalIdFileName = path // path to the photo on server

            const dateObject = new Date(req.body.birthdate);
            dateObject.setHours(0, 0, 0, 0); // set time component to midnight
            userData.birthdate = dateObject;


            const user = await userRepository.createUser(userData);

            const token = createJWT(user.id);

            return res.status(201).json({ user: user, token: token });
        } else {
            fs.unlinkSync(path);
            return res.status(400).json({ message: "National ID is not valid" });
        }

    } catch (error) {
        fs.unlinkSync(path);
        res.status(400).json(error.message);
        next(error);
    }
}