const Post = require('../models/post');
const formidable = require('formidable');
const fs = require('fs');
const _ = require('lodash');

exports.postById = (req, res, next, id) => {
    Post.findById(id)
        .populate('comments.postedBy', '_id name')
        .populate('postedBy', '_id name role')
        .select('_id title body created postedBy likes comments photo')
        .exec((err, post) => {
            if (err || !post) {
                return res.status(400).json({
                    error: err
                });
            }
            req.post = post;
            console.log(`Found Post : ${req.post.title}`);
            next();
        });
};

exports.createPost = (req, res, next) => {
    let form = new formidable.IncomingForm();
    form.keepExtensions = false;
    form.parse(req, (err, fields, files) => {
        if (err) {
            return res.status(400).json({
                error: 'Image could not be uploaded'
            });
        }
        let post = new Post(fields);
        post.postedBy = req.profile;

        if (files.photo) {
            post.photo.data = fs.readFileSync(files.photo.path);
            post.photo.contentType = files.photo.type;
        }
        post.save((err, result) => {
            if (err) {
                return res.status(400).json({
                    error: err
                });
            }
            res.json(result);
        });
    });
};

// get all Post with pagination
exports.getPosts = async (req, res) => {
    const currentPage = req.query.page || 1;
    const perPage = 5;
    let totalItems;

    const posts = await Post.find()
        .countDocuments()
        .then(count => {
            totalItems = count;
            return Post.find()
                .skip((currentPage - 1) * perPage)
                .populate('comments.postedBy', '_id name')
                .populate('postedBy', '_id name')
                .select('_id title body created postedBy likes comments')
                .limit(perPage)
                .sort({ created: -1 });
        })
        .then(posts => {
            res.status(200).json(posts);
        })
        .catch(err => console.log(err));
};

exports.singlePost = (req, res) => {
    return res.json(req.post);
};

exports.postsByUser = (req, res) => {
    Post.find({ postedBy: req.profile._id })
        .populate('postedBy', '_id name')
        .populate('comments', 'text created')
        .populate('comments.postedBy', '_id name')
        .select('_id title body created postedBy comments likes')
        .sort('_created')
        .exec((err, posts) => {
            if (err) {
                return res.status(400).json({
                    error: err
                });
            }
            res.json(posts);
        });
};

exports.isPoster = (req, res, next) => {
    let sameUser = req.post && req.auth && req.post.postedBy._id == req.auth._id;
    let adminUser = req.post && req.auth && req.auth.role === 'admin';

    let isPoster = sameUser || adminUser;

    if (!isPoster) {
        return res.status(403).json({
            error: 'User is not authorized'
        });
    }
    next();
};


exports.updatePost = (req, res, next) => {
    let form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.parse(req, (err, fields, files) => {
        if (err) {
            return res.status(400).json({
                error: 'Photo could not be uploaded'
            });
        }
        // save post
        let post = req.post;
        post = _.extend(post, fields);
        post.updated = Date.now();

        if (files.photo) {
            post.photo.data = fs.readFileSync(files.photo.path);
            post.photo.contentType = files.photo.type;
        }

        post.save((err, result) => {
            if (err) {
                return res.status(400).json({
                    error: err
                });
            }
            res.json(post);
        });
    });
};

exports.deletePost = (req, res) => {
    let post = req.post;
    post.remove((err, post) => {
        if (err) {
            return res.status(400).json({
                error: err
            });
        }
        res.json({
            message: 'Post deleted successfully'
        });
    });
};

exports.photo = (req, res, next) => {
    res.set('Content-Type', req.post.photo.contentType);
    return res.send(req.post.photo.data);
};

exports.like = (req, res) => {
    Post.findOneAndUpdate({_id:req.body.postId}, { $push: { likes: req.auth._id} }, { new: true })
    .populate('likes', '_id name') 
    .exec(
        (err, result) => {
            if (err) {
                console.log(err);
                return res.status(400).json({
                    error: err
                });
            } else {
                res.json(result);
            }
        }
    );
};

exports.unlike = (req, res) => {
    Post.findByIdAndUpdate(req.body.postId, { $pull: { likes: req.auth._id } }, { new: true })
    .populate('likes', '_id name') 
    .exec(
        (err, result) => {
            if (err) {
                return res.status(400).json({
                    error: err
                });
            } else {
                res.json(result);
            }
        }
    );
};

exports.comment = (req, res) => {
    let comment = req.body.comment;
    comment.postedBy = req.auth._id;

    Post.findByIdAndUpdate(req.body.postId, { $push: { comments: comment } }, { new: true })
        .populate('likes', '_id name')    
        .populate('comments.postedBy', '_id name')
        .populate('postedBy', '_id name')
        .exec((err, result) => {
            if (err) {
                return res.status(400).json({
                    error: err
                });
            } else {
                res.json(result);
            }
        });
};

exports.uncomment = (req, res) => {
    let comment = req.body.comment;

    Post.findByIdAndUpdate(req.body.postId, { $pull: { comments: { _id: comment._id } } }, { new: true })
        .populate('comments.postedBy', '_id name')
        .populate('postedBy', '_id name')
        .exec((err, result) => {
            if (err) {
                return res.status(400).json({
                    error: err
                });
            } else {
                res.json(result);
            }
        });
};

exports.updateComment = (req, res) => {
    let comment = req.body.comment;

    Post.findByIdAndUpdate(req.body.postId, { $pull: { comments: { _id: comment._id } } }).exec((err, result) => {
        if (err) {
            return res.status(400).json({
                error: err
            });
        } else {
            Post.findByIdAndUpdate(
                req.body.postId,
                { $push: { comments: comment, updated: new Date() } },
                { new: true }
            )
                .populate('comments.postedBy', '_id name')
                .populate('postedBy', '_id name')
                .exec((err, result) => {
                    if (err) {
                        return res.status(400).json({
                            error: err
                        });
                    } else {
                        res.json(result);
                    }
                });
        }
    });
};


