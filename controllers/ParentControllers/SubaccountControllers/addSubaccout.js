import { PrismaClient } from "@prisma/client";
import { UserRepository } from '../../../repositories/UserRepository.js'
import { SubaccountRepository } from '../../../repositories/SubaccountRepository.js'
import { TransactionRepository } from '../../../repositories/TransactionRepository.js'


import { validateNID } from "../../../services/NationalIDServices.js"

import { hashPassword, createJWT } from '../../../helpers.js'

let prisma = new PrismaClient()

const userRepository = new UserRepository(prisma);

const subaccountRepository = new SubaccountRepository(prisma);

const transactionRepository = new TransactionRepository(prisma);

// add subaccount for the user and add it as an account that can log in later
export async function addSubaccount(req, res) {
    try {
        const phoneExists = phoneExists();

        if (phoneExists) {
            return res.status(406).json({ error: "Phone number already registered" })
        }

        const userNameExists = userNameExists();

        if (userNameExists) {
            return res.status(406).json({ error: "Username already registered" })
        }

        // extract the data from the body
        const subaccountData = req.body;

        updateSubAccountData(subaccountData);

        const newSubaccount = await subaccountRepository.createSubaccount(subaccountData)

        // if the subaccount owner entered an initial balance for the subaccount
        const hasSpendingLimit = subaccountData.spendingLimit;

        if (hasSpendingLimit) {
            updateOwnerBalance(subaccountData)
            createTransaction(subaccountData, newSubaccount);
        }

        return res.status(201).json({ 'subaccount': newSubaccount })

    } catch (error) {

        return res.status(500).json({ error: error.message })
    }
}

function phoneExists() {
    // check if the phone number is registered before
    const existingPhoneFromSubaccounts = await subaccountRepository.getSubaccountByPhone(req.body.phone);

    const existingPhoneFromUsers = await userRepository.findUserByPhone(req.body.phone)

    return existingPhoneFromSubaccounts || existingPhoneFromUsers;
}

function userNameExists() {
    // check if the user name is registered before

    const existingUsernameFromSubaccounts = await subaccountRepository.getSubaccountByPhone(req.body.username);
    const existingUsernameFromUsers = await userRepository.findUserByUsername(req.body.username)

    return existingUsernameFromSubaccounts || existingUsernameFromUsers;;
}

function updateSubAccountData(subaccountData) {
    // hashing the password 
    const hashedPassword = await hashPassword(subaccountData.password);

    subaccountData.password = hashedPassword;

    const dateObject = new Date(req.body.birthdate);

    dateObject.setHours(0, 0, 0, 0); // set time component to midnight

    subaccountData.birthdate = dateObject;
}


function updateOwnerBalance(subaccountData) {
    // deduct the owner's balance with the balance assigned to the subaccount
    const owner = await userRepository.findUserByID(subaccountData.ownerID);

    if (owner.balance < subaccountData.spendingLimit) {
        return res.status(400).json({ error: "Insufficient balance" })
    }

    const newOwnerBalance = owner.balance - subaccountData.spendingLimit;

    await userRepository.updateBalance(owner.UID, newOwnerBalance);
}

function createTransaction(subaccountData, newSubaccount) {
    //create a new transaction to save the transaction done between parent and child
    let transactionData = {
        sender_id: subaccountData.ownerID,
        recipientSubaccountUID: newSubaccount.id,
        amount: subaccountData.spendingLimit,
        status: "COMPLETED",
        paymentMethod: "WALLET",
        transactionType: "FUND_SUBACCOUNT"
    }

    await transactionRepository.createTransaction(transactionData);
}