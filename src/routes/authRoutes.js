import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../prismaClient.js'

const router = express.Router()

// Register a new user endpoing /auth/register
router.post('/register', async (req, res) => {
    const { username, password } = req.body
    // save the username and an irreversibly encrypted password
    // save gilgamesh@gmail.com | aklsdjfasdf.asdf..qwe..q.we...qwe.qw.easd

    // encrypt the password
    const hashedPassword = bcrypt.hashSync(password, 8)

    // save the new user and hashed password to the db
    try {
        const user = await prisma.user.create({
            data : {
                username,
                password: hashedPassword
            }
        })

        // now that we have a user, I want to add their first expense for them
        const defaultExpense = `Hello :) Add your first expense!`
        await prisma.expense.create({
            data: {
                title : defaultExpense,
                amount : 0,
                userId : user.id
            }
        })

        // create a token
        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
        res.json({ token })
    } catch (err) {
        console.log(err.message)
        res.sendStatus(503)
    }
})

router.post('/login', async (req, res) => {
    // we get their email, and we look up the password associated with that email in the database
    // but we get it back and see it's encrypted, which means that we cannot compare it to the one the user just used trying to login
    // so what we can to do, is again, one way encrypt the password the user just entered

    const { username, password } = req.body

    try{
        const user = await prisma.user.findUnique({
            where:{
                username : username
            }
        })

        if (!user){
            return res.status(404).send({message : "user not found"})
        }

        const passwordIsValid = bcrypt.compareSync(password, user.password)

        if(!passwordIsValid){
            return req.status(401).send({message : "password is invalid"})
        }

        const token = jwt.sign({id: user.id}, process.env.JWT_SECRET,{expiresIn : '24h'})
        res.send({token})
    }catch(err){
        console.log(err.message)
        res.sendStatus(503)
    }

})


export default router